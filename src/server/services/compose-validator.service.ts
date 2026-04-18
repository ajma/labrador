import yaml from 'js-yaml';

interface ValidationError {
  line?: number;
  message: string;
}

interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationError[];
  parsed?: any;
}

export class ComposeValidatorService {
  validate(content: string): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationError[] = [];

    // 1. Try parsing YAML
    let parsed: any;
    try {
      parsed = yaml.load(content);
    } catch (e: any) {
      if (e.mark) {
        errors.push({ line: e.mark.line + 1, message: e.message });
      } else {
        errors.push({ message: `Invalid YAML: ${e.message}` });
      }
      return { valid: false, errors, warnings };
    }

    // 2. Check it's an object
    if (!parsed || typeof parsed !== 'object') {
      errors.push({ message: 'Compose file must be a YAML mapping' });
      return { valid: false, errors, warnings };
    }

    // 3. Check for 'services' key (required)
    if (!parsed.services || typeof parsed.services !== 'object') {
      errors.push({ message: "Missing required 'services' key" });
      return { valid: false, errors, warnings };
    }

    // 4. Validate each service
    for (const [name, service] of Object.entries(parsed.services)) {
      if (!service || typeof service !== 'object') {
        errors.push({ message: `Service '${name}' must be a mapping` });
        continue;
      }
      const svc = service as Record<string, any>;

      // Must have image or build
      if (!svc.image && !svc.build) {
        errors.push({ message: `Service '${name}': must specify 'image' or 'build'` });
      }

      // Validate ports if present
      if (svc.ports) {
        if (!Array.isArray(svc.ports)) {
          errors.push({ message: `Service '${name}': 'ports' must be a list` });
        } else {
          for (const port of svc.ports) {
            if (typeof port === 'string' && !/^\d+([:-]\d+)?(\/\w+)?$/.test(port) && !/^\d+\.\d+\.\d+\.\d+:\d+:\d+/.test(port)) {
              // Allow common port formats, warn on unusual ones
              warnings.push({ message: `Service '${name}': unusual port format '${port}'` });
            }
          }
        }
      }

      // Validate volumes if present
      if (svc.volumes && !Array.isArray(svc.volumes)) {
        errors.push({ message: `Service '${name}': 'volumes' must be a list` });
      }

      // Validate environment if present
      if (svc.environment && typeof svc.environment !== 'object' && !Array.isArray(svc.environment)) {
        errors.push({ message: `Service '${name}': 'environment' must be a mapping or list` });
      }

      // Warn about privileged mode
      if (svc.privileged === true) {
        warnings.push({ message: `Service '${name}': 'privileged' mode is enabled` });
      }

      // Validate restart policy
      if (svc.restart && !['no', 'always', 'on-failure', 'unless-stopped'].includes(svc.restart)) {
        warnings.push({ message: `Service '${name}': unusual restart policy '${svc.restart}'` });
      }

      // Validate depends_on
      if (svc.depends_on) {
        const deps = Array.isArray(svc.depends_on) ? svc.depends_on : Object.keys(svc.depends_on);
        for (const dep of deps) {
          if (!parsed.services[dep]) {
            errors.push({ message: `Service '${name}': depends_on '${dep}' not found in services` });
          }
        }
      }
    }

    // 5. Validate network references
    if (parsed.networks) {
      for (const [name, service] of Object.entries(parsed.services)) {
        const svc = service as Record<string, any>;
        if (svc.networks) {
          const nets = Array.isArray(svc.networks) ? svc.networks : Object.keys(svc.networks);
          for (const net of nets) {
            if (!parsed.networks[net] && net !== 'default') {
              errors.push({ message: `Service '${name}': network '${net}' not defined in networks section` });
            }
          }
        }
      }
    }

    return { valid: errors.length === 0, errors, warnings, parsed };
  }
}
