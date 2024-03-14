var padManager      = require('ep_etherpad-lite/node/db/PadManager'),
  settings          = require('ep_etherpad-lite/node/utils/Settings'),
  async             = require('ep_etherpad-lite/node_modules/async'),

const log4js = require('ep_etherpad-lite/node_modules/log4js');
const logger = log4js.getLogger('ep_delete_after_delay');

var epVersion = parseFloat(require('ep_etherpad-lite/package.json').version);
var usePromises = epVersion >= 1.8
var getPad, listAllPads, doesPadExist;

if (usePromises) {
  getPad = callbackify2(padManager.getPad)
  listAllPads = callbackify0(padManager.listAllPads)
  doesPadExist = callbackify1(padManager.doesPadExist);
} else {
  getPad = padManager.getPad
  listAllPads = padManager.listAllPads
  doesPadExist = padManager.doesPadExist;
}

// Get settings
var areParamsOk = (settings.ep_delete_after_delay) ? true : false,
    delay, replaceText, loopDelay, deleteAtStart;
if (areParamsOk) {
    delay         = settings.ep_delete_after_delay.delay;
    loop          = (settings.ep_delete_after_delay.loop !== undefined) ? settings.ep_delete_after_delay.loop : true;
    loopDelay     = settings.ep_delete_after_delay.loopDelay || 3600;
    deleteAtStart = (settings.ep_delete_after_delay.deleteAtStart !== undefined) ? settings.ep_delete_after_delay.deleteAtStart : true;
    replaceText   = settings.ep_delete_after_delay.text || "The content of this pad has been deleted since it was older than the configured delay.";
    areParamsOk   = (typeof delay === 'number' && delay > 0) ? true : false;
    if (areParamsOk === false) {
        logger.error('ep_delete_after_delay.delay must be a number an not negative! Check you settings.json.');
    }
    areParamsOk = (typeof loopDelay === 'number' && loopDelay > 0) ? true : false;
    if (areParamsOk === false) {
        logger.error('ep_delete_after_delay.loopDelay must be a number an not negative! Check you settings.json.');
    }
} else {
    logger.error('You need to configure ep_delete_after_delay in your settings.json!');
}

// Recurring deletion function
var waitForIt = function() {
    setTimeout(function() {
        logger.info('New loop');
        delete_old_pads();
        waitForIt();
    }, loopDelay * 1000);
};

// Delete old pads at startup
if (deleteAtStart) {
    delete_old_pads();
}

// start the recurring deletion loop
if (loop) {
    waitForIt();
}

// deletion loop
function delete_old_pads() {
    // Deletion queue (avoids max stack size error), 2 workers
    var q = async.queue(function ({pad, timestamp}, _callback) {
      pad.remove()

      logger.info('Pad '+pad.id+' deleted since expired (delay: '+delay+' seconds, last edition: '+timestamp+').');
      // Create new pad with an explanation
      getPad(pad.id, replaceText, function() {
        // Create disconnect message
        var msg = {
            type: "COLLABROOM",
            data: {
                type: "CUSTOM",
                payload: {
                    authorId: null,
                    action: "requestRECONNECT",
                    padId: pad.id
                }
            }
        };
      });
    }, 2);
    
    // Emptyness test queue
    var p = async.queue(function(padId, callback) {
        getPad(padId, null, function(err, pad) {
            // If this is a new pad, there's nothing to do
            var head = pad.getHeadRevisionNumber();
            if (head !== null  && head !== undefined && head !== 0) {
              var getLastEdit = getLastEditFun(pad)

              getLastEdit(function(_callback, timestamp) {
                    if (timestamp !== undefined && timestamp !== null) {
                        var currentTime = (new Date).getTime();
                        // Are we over delay?
                        if ((currentTime - timestamp) > (delay * 1000)) {
                            logger.debug('Pushing %s to q queue', pad.id);
                            // Remove pad
                            q.push({pad, timestamp});
                        } else {
                            logger.debug('Nothing to do with '+padId+' (not expired)');
                        }
                    }
                });
            } else {
                logger.debug('New or empty pad '+padId);
            }
            callback();
        });
    }, 1);
    listAllPads(function (_err, data) {
        for (var i = 0; i < data.padIDs.length; i++) {
            var padId = data.padIDs[i];
            logger.debug('Pushing %s to p queue', padId);
            p.push(padId, function (_err) { });
        }
    });
}

// Add CSS
exports.eejsBlock_styles = function (_hook, context, cb) {
    context.content = context.content + '<link rel="stylesheet" type="text/css" href="../static/plugins/ep_delete_after_delay/static/css/reconnect.css"></link>';
    return cb();
}

exports.registerRoute  = function (_hook_name, args, cb) {
    args.app.get('/ttl/:pad', function(req, res, next) {
        var padId = req.params.pad;

        res.header("Access-Control-Allow-Origin", "*");
        res.setHeader('Content-Type', 'application/json');

        doesPadExist(padId, function(callback, doesExist) {
            if (doesExist === false) {
                res.send('{"ttl": null, "msg": "Empty pad"}');
            } else {
                getPad(padId, null, function(callback, pad) {

                    // If this is a new pad, there's nothing to do
                    if (pad.getHeadRevisionNumber() !== 0) {
                      var getLastEdit = getLastEditFun(pad)

                      getLastEdit(function(_callback, timestamp) {
                            if (timestamp !== undefined && timestamp !== null) {
                                var currentTime = (new Date).getTime();

                                var ttl = Math.floor((delay * 1000 - (currentTime - timestamp))/1000);
                                res.send('{"ttl": '+ttl+'}');
                            }
                        });
                    } else {
                        res.send('{"ttl": null, "msg": "New or empty pad"}');
                    }
                });
            }

        });
    });
    cb && cb();
}

function wrapPromise (p, cb) {
  return p.then(function (result) { cb(null, result); })
    .catch(function(err) { cb(err); });
}

function callbackify0 (fun) {
  return function (cb) {
    return wrapPromise(fun(), cb);
  };
};

function callbackify1 (fun) {
  return function (arg1, cb) {
    return wrapPromise(fun(arg1), cb);
  };
};

function callbackify2 (fun) {
  return function (arg1, arg2, cb) {
    return wrapPromise(fun(arg1, arg2), cb);
  };
};

function getLastEditFun (pad) {
  var fun = pad.getLastEdit.bind(pad)

  if (usePromises) {
    return callbackify0(fun)
  }

  return fun
}
