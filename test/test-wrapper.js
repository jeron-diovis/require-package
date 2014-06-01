// As plugin exports to global scope by himself and denies multiple initialization,
// it is impossible to reset it in different tests to guarantee side-effects absence.
//
// So we need to fake global environment for it, so it is like new plugin instance created in each test
function makeTestEnv(context) {
    (function () {
        //= ../src/require-package.js
    }).call(context);
    return context;
}
