export const ADMIN_EMAIL = "mohammed.ameeduzzama@gmail.com";

export const isAdminEmail = (email: string | undefined | null): boolean =>
  Boolean(email && email.trim().toLowerCase() === ADMIN_EMAIL);
