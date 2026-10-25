function canExportSales(access, query, read = access.scopeFor("sales.read")) {
  const exporting = access.scopeFor("sales.export");
  if (!read.global && !read.sellerIds.length) return false;
  if (exporting.global) return true;
  if (!exporting.sellerIds.length) return false;
  if (query.employeeId)
    return !["__none__", "__empty__"].includes(query.employeeId) && access.canRecord("sales.export", query.employeeId);
  return !read.global && access.covers("sales.export", read.sellerIds);
}

module.exports = { canExportSales };
