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
      sandbox: "sandbox"


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
          [
            "cd #{cfg('pkg.sandbox')}"
            "npm install"
            ("ln -sf $(pwd)/#{file} builders/brunch" for file in ["package.json", "node_modules"])...
          ].join("&&")

      buildSandbox:
        command: (builder) ->
          buildCommand = switch builder
            when "brunch" then "build"
            when "lmd"    then "build test"
            else throw new Error "Unknown sandbox builder: '#{builder}'"

          sandboxPath = sysPath.resolve cfg("pkg.sandbox")
          cfgPath = "#{sandboxPath}/builders/#{builder}"
          binPath = "#{sandboxPath}/node_modules/.bin/#{builder}"

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