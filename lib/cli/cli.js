'use strict';

var lookupCommand   = require('./lookup-command');
var Promise         = require('../ext/promise');
var emberCLIVersion = require('../utilities/ember-cli-version');
var UpdateChecker   = require('../models/update-checker');
var getOptionArgs   = require('../utilities/get-option-args');
var debug           = require('debug')('ember-cli:cli');

var validPlatformVersion = require('../utilities/valid-platform-version');

function CLI(options) {
  this.ui = options.ui;
  this.analytics = options.analytics;
  this.testing = options.testing;

  debug('testing %o', !!this.testing);
}

module.exports = CLI;

CLI.prototype.run = function(environment) {
  return Promise.hash(environment).then(function(environment) {
    var args = environment.cliArgs.slice();
    var commandName = args.shift();
    var commandArgs = args;
    var helpOptions;
    var update;

    var CurrentCommand = lookupCommand(environment.commands, commandName, commandArgs, {
      project: environment.project,
      ui: this.ui
    });

    var command = new CurrentCommand({
      ui:        this.ui,
      analytics: this.analytics,
      commands:  environment.commands,
      tasks:     environment.tasks,
      project:   environment.project,
      settings:  environment.settings,
      testing:   this.testing
    });

    getOptionArgs('--verbose', commandArgs).forEach(function(arg){
      process.env['EMBER_VERBOSE_' + arg.toUpperCase()] = 'true';
    });

    if (!validPlatformVersion(process.version) && !this.testing) {
      var chalk = require('chalk');

      this.ui.writeLine(chalk.red('Future versions of Ember CLI will not support ' + process.version + '. Please update to Node 0.12 or io.js.'));
    }

    this.ui.writeLine('version: ' + emberCLIVersion());
    debug('command: %s', commandName);

    if (commandName !== 'update' && !this.testing) {
      var a = new UpdateChecker(this.ui, environment.settings);
      update = a.checkForUpdates();
    }

    if(!this.testing) {
      process.chdir(environment.project.root);
    }

    command.beforeRun(commandArgs);

    return Promise.resolve(update).then(function() {
      return command.validateAndRun(commandArgs);
    }).then(function(result) {
      // if the help option was passed, call the help command
      if (result === 'callHelp') {
        helpOptions = {
          environment: environment,
          commandName: commandName,
          commandArgs: commandArgs
        };

        return this.callHelp(helpOptions);
      }

      return result;
    }.bind(this)).then(function(exitCode) {
      // TODO: fix this
      // Possibly this issue: https://github.com/joyent/node/issues/8329
      // Wait to resolve promise when running on windows.
      // This ensures that stdout is flushed so acceptance tests get full output
      return new Promise(function(resolve) {
        if (process.platform === 'win32') {
          setTimeout(resolve, 250, exitCode);
        } else {
          resolve(exitCode);
        }
      });
    });

  }.bind(this)).catch(this.logError.bind(this));
};

CLI.prototype.callHelp = function(options) {
  var environment = options.environment;
  var commandName = options.commandName;
  var commandArgs = options.commandArgs;
  var helpIndex = commandArgs.indexOf('--help');
  var hIndex = commandArgs.indexOf('-h');

  var HelpCommand = lookupCommand(environment.commands, 'help', commandArgs, {
    project: environment.project,
    ui: this.ui
  });

  var help = new HelpCommand({
    ui:        this.ui,
    analytics: this.analytics,
    commands:  environment.commands,
    tasks:     environment.tasks,
    project:   environment.project,
    settings:  environment.settings,
    testing:   this.testing
  });

  if (helpIndex > -1) {
    commandArgs.splice(helpIndex,1);
  }

  if (hIndex > -1) {
    commandArgs.splice(hIndex,1);
  }

  commandArgs.unshift(commandName);

  return help.validateAndRun(commandArgs);
};

CLI.prototype.logError = function(error) {
  if (this.testing && error){
    console.error(error.message);
    console.error(error.stack);
  }
  this.ui.writeError(error);
  return 1;
};
