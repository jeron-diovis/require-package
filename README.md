# require-package

Restrict access to modules for "require"

## The Need

There are different types of application architecture.

The worst of them is so-called "pass-through" architecture. When you just put all you files to several common folders - models/, views/, controllers/, maybe, templates/ and so on - 
and then mix all of them together. A huge folders, with dozens of files, without any hints about where each of them can be used.

Anything can be `require`d from anywhere. Models turns to a scrapyard of very different methods, each used (maybe, just once) in some particular view.
Views, used for a different scenarios, have a multiple entry points and also acquires a lot of methods, not related to each other.
Files, files, files... what do they do?

This is exactly what is called "can't see a forest behind the trees".

All this is unreadable. Unsupported. And becomes only worse while project grows. 

And project goes to hell. 

Alternatively, there is a "widget-based" (or something like this) architecture. When business-logic is separated by independent "widgets" ("packages", "components", call it as you like).
When all views, models and templates, required for particular task, are grouped together, and no external modules uses them.
 
Unfortunately, this can be done only by conventions inside a team. Because you can always `require` any module you want.
And team can change, and new people comes, and someone of them wants just to [programming, motherfucker](http://programming-motherfucker.com/), without all your "architectures" - and we have same problems again.

I'm tired of this. Enough. I want to know that if I have some completed piece of logic in my folder, **no one** **never** can interrupt there and use it for something it is not designed for.
I want to be **sure** of it.

So here is a little tool to make modules usage some more controllable.

**Disclaimer**: it is a "foolproof"-tool. You definitely don't need it if all your team understands what do they do. 
Otherwise, if you want to apply some safeguards to your code usage - welcome. 

## So how should it be?

1. Group business-logic in independent packages.

2. No package files should be available from outside of package, except of the "main" module, which exposes only really required "public API" to the outer world.
Optionally, can be more "public" files, but they should be explicitly listed. 

3. Explicit external dependencies. 
Always there are external dependencies - utilities, helpers, etc, which are used project-wide.
But nothing more should be available from inside package - it should be maximally independent from the outer world.

4. Of course, packages can be nested. In this case, need a way to control whether children can use parent's modules. 

## Well, is it already implemented somewhere?

Of course, but only partially.

* [Browserify](http://browserify.org/)
  
As it uses same algorithm as in Node.js, there is no need to explain anything.
 
* [RequireJS](http://requirejs.org/)

It has a built-in [packages support](http://requirejs.org/docs/api.html#packages)

Both of these tools provides you ability to organize packages in your code, but they don't restrict access to package files.

That's why additional tool required.

## Installation and Usage

### Common installation case

What this plugin actually does is wrapping global `require` function to provide additional logic. 
It is agnostic to real project structure and your loader's internal mechanisms - it is guided only by it's own config and incoming module path.

To use it, in common case you should do following:

1. Load your chosen loader script, so `require` function is available.
 
2. Load [`require-package.js`](https://github.com/jeron-diovis/require-package/blob/master/dist/require-package.js) script.

3. Somewhere in entry point of your application do this:
```JavaScript
require.packages.init([
  "packages/mySafePackage"
]);
```

That's it. From this moment, any module located inside `packages/mySafePackage` folder is not available from the outer world, except of ```packages/mySafePackage/index``` module. 
And all of them can require only modules, located inside this folder - no external dependencies.

Initialization can be done only once, to guarantee that no one overrides initial packages logic somewhere in the depths. 

Detailed packages configuration is described [below](#package-options).


### Loader-specific installation cases
 
#### [Brunch](https://github.com/brunch/brunch)

Put `require-package.js` in `vendor` folder, so it will not be wrapped to a module.

Then you have two options:

* Mark packages config also as vendor file - so it wil have direct access to global `require` function. 
  Probably, you want to do this by extending [`conventions.vendor`](https://github.com/brunch/brunch/blob/stable/docs/config.md#conventions) property in your brunch config.

```CoffeeScript
exports.config =
  files:
    javascripts:
      joinTo: 
        "app.js": /^app\//
        "vendor.js": /^vendor\//
      order:
        before: [
          # the only requirement is an order of these two files
          "vendor/require-package.js"
          "app/packages.js"
        ]
        
  conventions:
    vendor: [
      /(^bower_components|vendor)[\\/]/ # this is brunch defaults
      "app/packages.js" # here is our config
    ]
```

* Wrap packages config to a regular module to load it manually somewhere in your application.
  In this case, remember, that each module uses it's own local ```require``` function, so packages config should directly use global one:
```JavaScript
require.register("app/packages", function(exports, require, module) {
  window.require.packages.init([ ... ]);
});
```

#### [LMD](https://github.com/azproduction/lmd)

For LMD there is a [separate plugin](https://github.com/jeron-diovis/require-package/blob/master/dist/require-package-lmd.js).

Just install it as it is described in [LMD documentation](https://github.com/azproduction/lmd/wiki/User-made-plugins).

Then, put your packages config in a module and load it where you want. 
There is no need to access "global require" from a module or something like this.
 
It's not a problem to use also another LMD plugins, which also wraps `require` function (like [these](https://github.com/azproduction/lmd/wiki/Flags-and-plugins#stats-and-code-coverage), for example) - while they care about copying all custom properties to wrapper.

#### [RequireJS](http://requirejs.org/)

Probably, for basics it should work with RequireJS in the same way as with Brunch. 

But, as RequireJS has own packages config, it can be really confusing to have two different configurations in different places.

Also, RequireJS has an advanced [paths](http://requirejs.org/docs/api.html#config-paths) [mapping](http://requirejs.org/docs/api.html#config-map) system,
which can't be processed by `require-package` wrapper.

So, using both of these tools can be confusing and inconsistent. 
So it is not recommended, and I didn't test whether they can really work together.

#### [Browserify](http://browserify.org/)

Here all is simple: it is impossible to use `require-package` with browserify :)

There are absolutely no ways to interrupt in it's internal loading mechanism. Though, browserify does not need it at all - it would be ambiguous to modify Node.js algorithm.

## Package options

Each package is an object with following properties:

#### `location` 

`String|RegExp|Function|Array` 

Where the package is.

Definition can be whatever you want - like [anymatch](https://github.com/es128/anymatch#anymatch), but without globbing.

If you don't want to customize other package parameters, you can define package as location only. 
Following are all correct package definitions: 
```JavaScript
require.packages.init([
 {
  location: "some/path/to/package"
 },
 /^packages\//,
 [
    function(path) { return path.slice(0, 4) === 'pkg_'; }
 ]
]);
```

As plugin does not know project structure, it "learns" while you require new modules, by comparing path to required module with location from config. 

Algorithm is following:
 
 1. First are always checked packages with "exact" location - that is, where location is just a string,
 
 2. They are checked starting from the closest possible package. 
   That is, if you have packages locations `root`, `root/subdir`, `root/subdir/deepdir`, 
   and you require path `root/someModule`, than comparing will start from `root/subdir` - so each module will be assigned to the deepest possible package.
      
 3. If no exact location found, than path is compared with "multipath" packages - where location is RegExp, Function, or array of that things.
  
 4. Multipath packages are checked in order they listed in config. 
 Be warn with this: for example, if you have two definitions -
  ```JavaScript
    require.packages.init([
      /^packages\//,
      {
        location: /^packages\/(first|second)Package/,
        ... some custom properties here ...
      }
    ]);
  ```
and you require module "packages/firstPackage" - it will be recognized as `/^packages\//`, which has no custom properties, so it's behavior will be not as you want.
 
 5. If one of multipath packages matches to module path, this path is recorded as new "exact" package. 
 
 6. If nothing matches, path is recorded as "out-of-package".
 
Of course, all results are cached, so for each particular module search is not performed each time you `require` it.

===

#### `main`

`String`

**Default**: `"index"`

Name of the package main file, which will be loaded when you `require` entire package directory.

===

#### `external` 

`String|RegExp|Function|Array`

**Default**: `false`

List of "out-of-package" modules, allowed to be `require`d from inside this package. 

By default, package can not require anything external.

===

#### `public` 

`String|RegExp|Function|Array`

**Default**: `false`

List of internal package modules, allowed to be `require`d from outside of this package (that is, both from "out-of-package" modules and from inside other packages).
 
By default, nothing is available - only main file can be loaded.

===

#### `packages` 

`String|RegExp|Function|Array`

**Default**: `false`

Packages, nested to current one. 

Nested packages can have own nested ones, and so on, without limitations.

There is something special about nested packages:

* Only **direct** parent can access them. `public` property implies only on it. For any other module neither `public`, nor `main` file of nested package are not available.
It is similar to Node.js algorithm - search is not performed downside by file tree.
 
* They can't have `external` property. Only the topmost package in tree can specify external dependencies. 
For the outer world, topmost package is a single unit (no one knows what it has inside), so only it's own configuration should determine what it depends from.

* They can't `require` a `main` file of any parent package, no matter whether it matches to list of available modules (see the next option).
Because parent package represents a logic of top level, where child package is just a one small part.

===  

#### `protected` 

`String|RegExp|Function|Array`

**Default**: `false`

List of modules, available for packages nested to current one.

By default, nothing is available. It differs from Node.js, but it is done for the same purpose - guarantees, that no one will `require` something you don't expect. 

It is assumed that not so much parent's modules will be required for children - it should be some basic classes, mostly models/collections, describing data structures, specific for package. 

Also, by default, children can require only *direct* parent's modules. It also can be [changed](#allowremoteprotected).

---

**Important note**: for all currently listed options paths are *relative to package location*. 

That is, if you have packages `parent` and `parent/child`, and want to make module `parent/child/myModule` public, you should do it like this:

```JavaScript
require.packages.init([
  {
    location: "parent",
    packages: [
      {
        location: "child"
        public: "myModule" // <== relative to "child". Do not specify full path `parent/child/myModule`.
      }
    ]
  }
]);
```

---

#### `inheritable`

`Object`

**Default**: 
```JavaScript
  {
    "main": false,
    "public": false,
    "packages": false,
    "protected": false,
    "inheritable": true
  }
```

What properties of parent's package it's nested packages will inherit.

You may want to create a packages tree where all packages follows same rules - for example, have their public files in "public" subfolder, etc.
In this case, it will be annoying to define such rules on each new nesting level. Instead, you may set rules for topmost package in tree, and allow for children to inherit them.

The rules are simple:
1. If package has own value for property, it will be used.
2. Otherwise, if property is allowed to inherit, it will be taken from *direct* parent package.
3. Otherwise global default value will be used. 

As you can see, `inheritable` hash contains all of the options above, except of `external` - because, as you remember, it is denied for children to have own external dependencies.
Values are just boolean, indicating whether inheritance is allowed.

Also, note, that `inheritable` hash contains "inheritable" property itself, with default to true. 
This means, that each new child allows for his to children to inherit his properties. You can set it to false and so break the inheritance chain - the next children will use only global defaults.

## Global options

You can also change some global plugin options, using `require.packages.configure()` method.

Just like `init` method, `configure` could be called only once, so no one module will suddenly override your settings. 
Also `configure` can not be called after `init` was, just for the same reason. So care about configuration before you actually initialize your packages structure. 

Following options are available:

===

#### `packageDefaults`

`Object`

Here you can override default value for any option from [package options](#package-options) section. 

It uses deep extending, so you can selectively override some options from `inheritable` hash.

```JavaScript
require.packages.configure({
  "packageDefaults": {
    "main": "main", // use main file like in RequireJS packages
    "external": ["utils", /^lib\//],  // set allowed externals for all packages (means, only top-level packages, of course)
    "inheritable": {
      "protected": true // and allow for all children to copy their parent's logic for 'protected' files 
    }
  }
});
```

===

#### `allowRemoteProtected`

`Boolean`

**Default**: `false`

Whether it is allowed for nested packages to `require` `protected` modules not only from *direct* parent package, but from any parent up to the top of three.
