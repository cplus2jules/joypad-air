// Older servers return English diagnostics. Codes are preferred when available.
export function setupErrorKey(error = {}) {
  const codeKeys = {
    local_only: 'setup.localOnly', invalid_layout: 'setup.layoutError', unsupported_layout: 'setup.layoutError',
    ryujinx_running: 'setup.quitFirst', config_not_found: 'ryujinxMissing',
    config_unreadable: 'setup.readError', unsupported_version: 'setup.unsupported',
    unsupported_config: 'setup.unsupported', setup_failed: 'setup.failed',
    process_check_failed: 'setup.runningUnknown',
  };
  if (Object.hasOwn(codeKeys, error.code)) return codeKeys[error.code];
  const message = error.message || error.error || '';
  if (/Quit Ryujinx/i.test(message)) return 'setup.quitFirst';
  if (/Unsupported Ryujinx config version/i.test(message)) return 'setup.unsupported';
  if (/layout/i.test(message)) return 'setup.layoutError';
  if (/localhost/i.test(message)) return 'setup.localOnly';
  if (/Cannot check whether Ryujinx/i.test(message)) return 'setup.runningUnknown';
  if (/ENOENT|Open Ryujinx once/i.test(message)) return 'ryujinxMissing';
  if (/could not be read|JSON/i.test(message)) return 'setup.readError';
  return 'setup.failed';
}

