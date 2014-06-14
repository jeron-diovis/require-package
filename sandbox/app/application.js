// some workaround to allow for dependencies to be parsed by static analyzers
var loaders = {
    'packages/test': function () { return require('packages/test'); },
    'packages/test/internal': function () { return require('packages/test/internal'); }
};

var page = document.getElementById('page');

for (var modulePath in loaders) {
    var loader = loaders[modulePath];

    var log, list = document.createElement('ul');

    log = document.createElement('div');
    log.innerHTML = 'Require module "' + modulePath + '":';
    page.appendChild(log);

    var moduleContent;
    try {
        moduleContent = loader();
    } catch (e) {
        log = document.createElement('li');
        log.innerHTML = 'Error raised: ' + e.message;
        list.appendChild(log);
    }

    log = document.createElement('li');
    log.innerHTML = 'Loaded module content: ' + moduleContent;
    list.appendChild(log);

    page.appendChild(list);
    page.appendChild(document.createElement('hr'));
}