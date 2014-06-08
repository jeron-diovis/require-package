module.exports = (grunt) ->
  require("matchdep").filterDev("grunt-*").forEach grunt.loadNpmTasks

  sysPath = require "path"
  cfg = grunt.config

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
      sandboxBuilders: "sandbox/builders"


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


    shell:
      installSandboxBuilders:
        command: ->
          builders = [].concat (["cd #{path}", "npm install", "cd -"].join("&&") for path in grunt.file.expand sysPath.join cfg("pkg.sandboxBuilders"), "*")
          builders.join("&&")

      buildSandbox:
        command: (builder) ->
          buildCommand = switch builder
            when "brunch" then "build"
            when "lmd"    then "build test"
            else throw new Error "Unknown sandbox builder: '#{builder}'"

          cfgPath = sysPath.resolve sysPath.join cfg("pkg.sandboxBuilders"), builder
          binPath = sysPath.join cfgPath, "node_modules/.bin/#{builder}"

          [
            "cd #{cfgPath}"
            "#{binPath} #{buildCommand}"
            "cd -"
          ].join("&&")

  }

  grunt.registerTask "setup", ["rig:dist", "rig:test"]
  grunt.registerTask "start", ["setup", "karma:watch:start", "watch"]
  grunt.registerTask "test", ["setup", "karma:CI"]

  grunt.registerTask "build", ["setup", "uglify"]
  grunt.registerTask "default", ["build", "sandbox"]

  grunt.registerTask "sandbox", (target = "install", builder = "brunch") ->
    install = -> grunt.task.run "shell:installSandboxBuilders"
    build   = -> grunt.task.run "shell:buildSandbox:#{builder}"

    unless @args.length
      install()
      build()
    else switch target
      when "install" then install()
      when "build"   then build()
      else throw new Error "Unknown target: '#{target}'"