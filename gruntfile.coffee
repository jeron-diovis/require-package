module.exports = (grunt) ->
  require("matchdep").filterDev("grunt-*").forEach grunt.loadNpmTasks

  grunt.initConfig {
    pkg:
      name: "require-package"
      dist: "dist"
      src: "src/<%=pkg.name %>.js"
      tests: [
        "<%=rig.test.dest %>"
        "test/test-config.coffee"
        "test/spec/**/*.{js,coffee}"
      ]


    uglify:
      all:
        expand: yes
        cwd: "<%=pkg.dist %>"
        src: "*.js"
        dest: "<%=pkg.dist %>/min"
        rename: (dest, src) -> "#{dest}/#{src.replace /\.\w+$/, '.min$&'}"


    rig:
      dist:
        files: ({
          src: "src/wrappers/#{wrapper}.js"
          dest: "<%=pkg.dist %>/<%=pkg.name %>#{suffix}.js"
        } for wrapper, suffix of {
          "global": ""
          "module": "-commonjs"
          "lmd": "-lmd"
        })

      test:
        src: "test/test-wrapper.js"
        dest: "test/test-build.js"


    karma:
      options:
        configFile: "karma.conf.coffee"
        basePath: "."
        files: "<%=pkg.tests %>"

      watch:
        options:
          background: yes

      CI:
        options:
          singleRun: yes
          browsers: ["PhantomJS"]


    watch:
      gruntfile: files: "gruntfile.coffee"

      rig:
        files: "<%=pkg.src %>"
        tasks: ["rig"]

      karma:
        files: "<%=pkg.tests %>"
        tasks: ["karma:watch:run"]
  }

  grunt.registerTask "setup", ["rig:dist", "rig:test"]
  grunt.registerTask "start", ["setup", "karma:watch:start", "watch"]
  grunt.registerTask "test", ["setup", "karma:CI"]

  grunt.registerTask "build", ["setup", "uglify"]
  grunt.registerTask "default", "build"