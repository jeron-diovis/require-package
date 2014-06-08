function makeTestEnv(context) {
    var module = {};
    //= ../dist/require-package-commonjs.js
    module.exports(context);
    return context;
}
