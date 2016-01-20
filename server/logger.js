module.exports = {
  LOGLEVEL: {
    INFO  : 'INFO',
    ERROR : 'ERROR',
    DEBUG : 'DEBUG'
  },
  log: function (level, msg, name, info) {
    var now = new Date();
    var logMsg = now.toISOString() + ' [' + name + '] ' + level + ': ' +
      (info ? info.src : '') + ' ' + msg;

    console.log(logMsg);
  }
};
