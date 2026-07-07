export const logger = {
  info(message: string, data?: unknown) {
    console.log(
      `[INFO] ${new Date().toISOString()} - ${message}`,
      data ?? ""
    );
  },

  warn(message: string, data?: unknown) {
    console.warn(
      `[WARN] ${new Date().toISOString()} - ${message}`,
      data ?? ""
    );
  },

  error(message: string, data?: unknown) {
    console.error(
      `[ERROR] ${new Date().toISOString()} - ${message}`,
      data ?? ""
    );
  },
};