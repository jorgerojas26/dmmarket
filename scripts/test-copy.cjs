const { copyRealDatabase } = require("../tests/support/test-database.cjs");
const { withTestSession } = require("../tests/support/test-session.cjs");
const args = process.argv.slice(2);
const value = (name) => args[args.indexOf(name) + 1];
if (
  args.length % 2 ||
  args.some(
    (arg, index) =>
      index % 2 === 0 && !["--source-container", "--source-database", "--confirm", "--consistency"].includes(arg),
  )
)
  throw new Error(
    "Usa --source-container NOMBRE --source-database BASE [--confirm dmmarket_real_test] [--consistency transactional|locked].",
  );
withTestSession(() =>
  copyRealDatabase(
    args.includes("--source-container") ? value("--source-container") : undefined,
    args.includes("--source-database") ? value("--source-database") : undefined,
    args.includes("--confirm") ? value("--confirm") : undefined,
    args.includes("--consistency") ? value("--consistency") : "transactional",
  ),
).catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
