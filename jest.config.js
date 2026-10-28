export default {
  testEnvironment: "node",
  watchman: false,
  transform: {},
  passWithNoTests: true,
  // macOS writes "._*" metadata files on non-APFS drives; they are not tests.
  testPathIgnorePatterns: ["/node_modules/", "/\\._"],
  modulePathIgnorePatterns: ["/\\._"],
};
