module.exports = {
  testEnvironment: "node",
  testMatch: ["<rootDir>/*.integration.cjs"],
  testTimeout: 60000,
  maxWorkers: 1,
  watchman: false,
};
