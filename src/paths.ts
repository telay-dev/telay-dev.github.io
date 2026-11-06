export const appBase = import.meta.env.BASE_URL;

export const appPath = (path: string) =>
  `${appBase}${path.replace(/^\/+/, "")}`;
