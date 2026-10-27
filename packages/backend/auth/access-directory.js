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

function createAccessDirectory(sessions) {
  return {
    users(sid, query) {
      const { page, search } = filters(query);
      const state = query.state || "all";
      if (!["all", "enabled", "disabled"].includes(state)) invalid();
      return sessions.withSession(sid, {}, async ({ access, transaction }) => {
        if (!["access.users", "access.roles", "access.links", "access.recover"].some((key) => access.hasGlobal(key)))
          forbidden();
        const directory = transaction("dmmarket_auth_users");
        if (search)
          directory.where((builder) =>
            builder.where("username", "like", `%${search}%`).orWhere("display_name", "like", `%${search}%`),
          );
        if (state !== "all") directory.where("enabled", state === "enabled");
        const total = Number((await directory.clone().count("* as total").first()).total);
        const rows = await directory
          .select("id", "username", "display_name", "enabled")
          .orderBy("username")
          .limit(100)
          .offset((page - 1) * 100);
        if (access.hasGlobal("access.roles")) {
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
      if (ids && (ids.length > 100 || ids.some((id) => !/^[\p{L}\p{N}._-]{1,32}$/u.test(id)))) invalid();
      return sessions.withSession(sid, {}, async ({ access, transaction }) => {
        if (!access.hasGlobal("access.links")) forbidden();
        const sellers = transaction("vendedores");
        if (ids) sellers.whereIn("idVend", ids);
        if (search)
          sellers.where((builder) =>
            builder.where("idVend", "like", `%${search}%`).orWhere("Empresa", "like", `%${search}%`),
          );
        const total = Number((await sellers.clone().count("* as total").first()).total);
        const data = await sellers
          .select({ id: "idVend", name: "Empresa" })
          .orderBy("Empresa")
          .orderBy("idVend")
          .limit(100)
          .offset((page - 1) * 100);
        return { data: data.map(({ id, name }) => ({ id: String(id), name })), total, page };
      });
    },
  };
}

module.exports = { createAccessDirectory };
