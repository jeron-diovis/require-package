var page = document.getElementById('page');

var modules = ['packages/test', 'packages/test/internal'];

modules.forEach(function (modulePath) {
    var log, list = document.createElement('ul');

    log = document.createElement('div');
    log.innerHTML = 'Require module "' + modulePath + '":';
    page.appendChild(log);

    var moduleContent;
    try {
        moduleContent = require(modulePath);
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
});