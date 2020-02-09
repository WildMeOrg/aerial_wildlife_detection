'''
    Serves all modules' static files from a single URL.
    Also contains a number of static files that are general
    to AIDE as a whole.

    2019-20 Benjamin Kellenberger
'''

import os
import json
from bottle import static_file, abort


class StaticFileServer:

    MODULE_ROUTINGS = {
        'general': 'modules/StaticFiles/static',
        'interface': 'modules/LabelUI/static',
        'reception': 'modules/Reception/static',
        'dataAdmin': 'modules/DataAdministration/static',
        'projectAdmin': 'modules/ProjectAdministration/static'
    }

    def __init__(self, config, app):
        self.config = config
        self.app = app

        self.login_check = None
        self._initBottle()


    def loginCheck(self, project=None, admin=False, superuser=False, canCreateProjects=False, extend_session=False):
        return self.login_check(project, admin, superuser, canCreateProjects, extend_session)


    def addLoginCheckFun(self, loginCheckFun):
        self.login_check = loginCheckFun

    
    def _initBottle(self):

        @self.app.route('/favicon.ico')
        def favicon():
            return static_file('favicon.ico', root='modules/StaticFiles/static/img')


        @self.app.route('/about')
        @self.app.route('/<project>/about')
        def about(project=None):
            return static_file('about.html', root='modules/StaticFiles/static/templates')


        @self.app.get('/getBackdrops')
        def get_backdrops():
            try:
                return {'info': json.load(open('modules/StaticFiles/static/img/backdrops/backdrops.json', 'r'))}
            except:
                abort(500)


        @self.app.route('/static/<module>/<filename:re:.*>')
        def send_static(module, filename):
            return static_file(filename, self.MODULE_ROUTINGS[module])


        @self.app.route('/<project>/static/<module>/<filename:re:.*>')
        def send_static_proj(project, module, filename):
            return send_static(module, filename)