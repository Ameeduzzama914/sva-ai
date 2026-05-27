const resolveAdminEmail = (): string => {
  const raw =
    process.env.ADMIN_EMAIL ??
    process.env.NEXT_PUBLIC_ADMIN_EMAIL ??
    "";
  return raw.trim().toLowerCase();
};

export const getAdminEmail = (): string => resolveAdminEmail();

export const isAdminEmail = (email: string | undefined | null): boolean => {
  const admin = resolveAdminEmail();
  if (!admin || !email) {
    return false;
  }
  return email.trim().toLowerCase() === admin;
};
