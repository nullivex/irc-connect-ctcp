'use strict';
var debug = require('debug')('irc:ctcp')
var moment = require('moment')



/**
 * Plugin constructor
 * @constructor
 */
var Ctcp = function(){
  var that = this
  that.options = {}
  that.defaultVersion = that.mkVersion('UNKNOWN')
  that.options.version = that.defaultVersion
}



/**
 * Clone an event and keep new object properties in order
 * @param {object} event Source irc-connect Event
 * @constructor
 */
Ctcp.prototype.Event = function(event){
  var that = this
  var ctcpPropOrder = [
    'nick','user','host','command',
    'type','target','params','message'
  ]
  ctcpPropOrder.forEach(function(prop){
    that[prop] = (event.hasOwnProperty(prop)) ? event[prop] : null
  })
}


/**
 * Get an option
 * @param {string} key Option name
 * @return {*} Value (no filter, could return undefined, null, whatever)
 */
Ctcp.prototype.getOption = function(key){
  var that = this
  return that.options[key]
}


/**
 * Set an option
 * @param {string} key Option
 * @param {*} value Value
 */
Ctcp.prototype.setOption = function(key,value){
  var that = this
  if('version' === key) value = that.mkVersion(value)
  //use magic 'versionRaw' option to bypass the above convenience
  if('versionRaw' === key) key = 'version'
  debug('setting options[\''+key+'\'] = ' + value)
  that.options[key] = value
}


/**
 * Build a version string
 * @param {string} appName Application name (middle section of the "colon standard")
 * @return {string}
 */
Ctcp.prototype.mkVersion = function(appName){
  return [
    'irc-connect-ctcp',
      appName || 'UNKNOWN',
      'NodeJS=' + process.versions.node + '+(V8=' + process.versions.v8 + ')'
    ].join(':')
}


/**
 * Encode a payload
 * @param {string} direction 'req' or 'res', controls which type of message to use
 * @param {string} target Target
 * @param {string} type CTCP Type
 * @param {Array} params CTCP Parameters
 * @return {string} Encoded CTCP message ready for irc send()
 */
Ctcp.prototype.ctcpEncode = function(direction,target,type,params){
  var cmd = {req:'PRIVMSG',res:'NOTICE'}[direction]
  var msg = [type.toUpperCase()]
  if(params instanceof Array) params.forEach(function(p){msg.push(p)})
  else msg.push(params)
  return [cmd,target,':\x01' + msg.join(' ') + '\x01'].join(' ')
}


/**
 * Decode a payload, with detection
 * @param {object} event Event from irc-connect PRIVMSG or NOTICE event
 * @return {object|boolean} Parsed Event, or false if no CTCP payload
 */
Ctcp.prototype.ctcpDecode = function(event){
  if(!this.isCtcp(event)) return false
  var rv = new this.Event(event)
  rv.command = {PRIVMSG:'CTCP_REQUEST',NOTICE:'CTCP_RESPONSE'}[event.command]
  rv.target = '' + event.params[0]
  var message = '' + event.params[1]
  message = (message[0] === '+') ? message.slice(2) : message.slice(1)
  message = message.slice(0,message.indexOf('\x01'))
  var params = message.split(' ')
  rv.type = params[0].toUpperCase()
  params = params.splice(1)
  rv.params = params
  rv.message = message.replace(/^\S+/,'').replace(/^\s/,'')
  return rv
}


/**
 * Checks an incoming message for CTCP payload
 * @param {object} event Event from irc-connect PRIVMSG or NOTICE event
 * @return {boolean}
 */
Ctcp.prototype.isCtcp = function(event){
  if(!event.params) return false
  var message = event.params.slice(1).join(' ') || ''
  return (((message[0] === '+' && message[1] === '\x01') || message[0] === '\x01') && -1 < message.lastIndexOf('\x01'))
}


//convenience for below debugs
/**
 *
 * @param {string} source Source
 * @param {string} target Target
 * @param {string} type CTCP Type
 * @param {(string|Array)} message
 * @return {string}
 */
var debugFmt= function(source,target,type,message){
  var msg = '' + message
  if(message instanceof Array) msg = message.join(' ')
  return [source,target,type.toUpperCase(),'[' + msg + ']'].join(' ')
}


/**
 * Send a CTCP Request
 * @param {string} target Target
 * @param {string} type CTCP Type
 * @param {Array} params CTCP Parameters
 */
Ctcp.prototype.requestSend = function(target,type,params){
  var that = this
  debug('send CTCP_REQUEST ' + debugFmt(that.clientNick(),target,type,params))
  that.clientSend(that.ctcpEncode('req',target,type.toUpperCase(),params))
}


/**
 * Send a CTCP Response
 * @param {string} target Target
 * @param {string} type CTCP Type
 * @param {Array} params CTCP Parameters
 */
Ctcp.prototype.responseSend = function(target,type,params){
  var that = this
  debug('send CTCP_RESPONSE ' + debugFmt(that.clientNick(),target,type,params))
  that.clientSend(that.ctcpEncode('res',target,type.toUpperCase(),params))
}


/**
 * Emit a message wrapped with standard stuff
 * @param {string} direction Direction, 'req' or 'res'
 * @param {object} event Event
 */
Ctcp.prototype.emit = function(direction,event){
  var that = this
  var e = 'ctcp_' + ({req:'request',res:'result'}[direction])
  debug(['emitting',e,JSON.stringify(event)].join(' '))
  that.clientEmit(e,event)
}


/**
 * Receive a CTCP Request, emit decoded event
 * @param {object} event Event from irc-connect PRIVMSG event
 * @return {void} to ignore non-CTCP payload
 */
Ctcp.prototype.requestRecv = function(event){
  var that = this
  if(!that.isCtcp(event)) return
  var c = that.ctcpDecode(event)
  that.emit('req',c)
  if('PING' === c.type){that.responseSend(c.nick,c.type,c.params[0])}
  if('TIME' === c.type){that.responseSend(c.nick,c.type,moment().format('ddd MMM DD HH:mm:ss YYYY ZZ'))}
  if('VERSION' === c.type && that.options.version){
    if(that.defaultVersion === that.options.version)
      debug('NOTE: you should set a version using irc.ctcpSetOption(), replying with default')
    that.responseSend(c.nick,c.type,that.options.version)
  }
}


/**
 * Receive a CTCP Response, emit decoded event
 * @param {object} event Event from irc-connect NOTICE event
 * @return {void} to ignore non-CTCP payload
 */
Ctcp.prototype.responseRecv = function(event){
  var that = this
  if(!that.isCtcp(event)) return
  that.emit('res',that.ctcpDecode(event))
}


/**
 * Export irc-connect plugin definition
 * @type {object}
 */
module.exports = {
  __irc: function(client){
    var ctcp = new Ctcp()
    //bind upper emit/send/nick
    ctcp.clientEmit = client.emit.bind(client)
    ctcp.clientSend = client.send.bind(client)
    ctcp.clientNick = client.nick.bind(client)
    //client function bindery
    client.ctcpSetOption = ctcp.setOption.bind(ctcp)
    client.ctcpGetOption = ctcp.getOption.bind(ctcp)
    client.isCtcp = ctcp.isCtcp.bind(ctcp)
    client.ctcpRequestSend = ctcp.requestSend.bind(ctcp)
    client.ctcpResponseSend = ctcp.responseSend.bind(ctcp)
    //client event hooks
    client
      .on('PRIVMSG', ctcp.requestRecv.bind(ctcp))
      .on('NOTICE', ctcp.responseRecv.bind(ctcp))
    debug('Plugin registered')
  },
  dcc: require('./types/dcc')
}
