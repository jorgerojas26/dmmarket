function invalid() {
  const error = new Error("Los filtros de búsqueda no son válidos.");
  error.status = 400;
  throw error;
}

function filters(query) {
  const page = query.page === undefined ? 1 : Number(query.page);
  const search = query.search === undefined ? "" : query.search;
  if (!Number.isInteger(page) || page < 1 || page > 10000 || typeof search !== "string" || search.length > 128)
    invalid();
  return { page, search: search.trim() };
}

function forbidden() {
  const error = new Error("Acceso no permitido.");
  error.status = 403;
  throw error;
}

const directoryCapabilities = ["access.users.read", "access.roles.read", "access.profile.read", "access.recovery.read"];

function createAccessDirectory(sessions) {
  return {
    user(sid, id) {
      if (typeof id !== "string" || !/^[a-f0-9-]{36}$/i.test(id)) invalid();
      return sessions.withSession(sid, { readOnly: true }, async ({ access, transaction }) => {
        if (!directoryCapabilities.some((key) => access.hasGlobal(key))) forbidden();
        const user = await transaction("dmmarket_auth_users")
          .where("id", id)
          .select(
            "id",
            "username",
            "display_name",
            "enabled",
            "must_change_password",
            "temporary_expires_ms",
            "mfa_required",
            "mfa_secret",
          )
          .first();
        if (!user) throw Object.assign(new Error("La cuenta no está disponible."), { status: 404 });
        const { mfa_secret: secret, ...account } = user;
        return { ...account, mfa_required: Number(account.mfa_required) === 1, mfa_enabled: Boolean(secret) };
      });
    },
    users(sid, query) {
      const { page, search } = filters(query);
      const state = query.state || "all";
      if (!["all", "enabled", "disabled"].includes(state)) invalid();
      return sessions.withSession(sid, { readOnly: true }, async ({ access, transaction }) => {
        if (!directoryCapabilities.some((key) => access.hasGlobal(key))) forbidden();
        const directory = transaction("dmmarket_auth_users");
        if (search)
          directory.where((builder) =>
            builder.where("username", "like", `%${search}%`).orWhere("display_name", "like", `%${search}%`),
          );
        if (state !== "all") directory.where("enabled", state === "enabled");
        const total = Number((await directory.clone().count("* as total").first()).total);
        const rows = await directory
          .select("id", "username", "display_name", "enabled", "must_change_password", "temporary_expires_ms")
          .orderBy("username")
          .limit(100)
          .offset((page - 1) * 100);
        if (access.hasGlobal("access.roles.read")) {
          const roles = rows.length
            ? await transaction("dmmarket_auth_user_roles as ur")
                .join("dmmarket_auth_roles as r", "r.id", "ur.role_id")
                .whereIn(
                  "ur.user_id",
                  rows.map((user) => user.id),
                )
                .select("ur.user_id", "r.id", "r.name")
                .orderBy("r.name")
            : [];
          for (const user of rows)
            user.roles = roles.filter((role) => role.user_id === user.id).map(({ id, name }) => ({ id, name }));
        }
        return { data: rows, total, page };
      });
    },
    sellers(sid, query) {
      const { page, search } = filters(query);
      const ids = query.ids === undefined ? null : typeof query.ids === "string" ? query.ids.split(",") : invalid();
      if (ids && (ids.length !== 1 || !/^[\p{L}\p{N}._-]{1,32}$/u.test(ids[0]))) invalid();
      const userId = query.userId === undefined ? null : query.userId;
      if (userId !== null && (typeof userId !== "string" || !/^[a-f0-9-]{36}$/i.test(userId))) invalid();
      return sessions.withSession(sid, { readOnly: true }, async ({ access, transaction }) => {
        if (!access.hasGlobal("access.profile.read")) forbidden();
        if (!(await transaction.schema.hasTable("vendedores"))) return { data: [], total: 0, page };
        const nameColumn = (await transaction.schema.hasColumn("vendedores", "Empresa"))
          ? "vendedores.Empresa"
          : "vendedores.idVend";
        const sellers = transaction("vendedores")
          .leftJoin("dmmarket_auth_commercial_profiles as profile", function () {
            this.on(transaction.raw("BINARY profile.seller_id = BINARY vendedores.idVend"));
          })
          .where((builder) => {
            builder.whereNull("profile.user_id");
            if (userId) builder.orWhere("profile.user_id", userId);
          });
        if (ids) sellers.whereIn("vendedores.idVend", ids);
        if (search)
          sellers.where((builder) =>
            builder.where("vendedores.idVend", "like", `%${search}%`).orWhere(nameColumn, "like", `%${search}%`),
          );
        const total = Number((await sellers.clone().count("* as total").first()).total);
        const data = await sellers
          .select({ id: "vendedores.idVend", name: nameColumn })
          .orderBy(nameColumn)
          .orderBy("vendedores.idVend")
          .limit(100)
          .offset((page - 1) * 100);
        return { data: data.map(({ id, name }) => ({ id: String(id), name })), total, page };
      });
    },
  };
}

module.exports = { createAccessDirectory };
