'use strict';
var debug = require('debug')('irc:ctcp')
var moment = require('moment')

var TypeDcc = require('./types/dcc')

var propCopy = function(obj){return JSON.parse(JSON.stringify(obj))}



/**
 * Plugin constructor, contain reference to client
 * @param {object} client
 * @constructor
 */
var CtcpPlugin = function(client){
  var that = this
  that.client = client
  that.options = {}
  that.defaultVersion = that.mkVersion('UNKNOWN')
  that.options.version = that.defaultVersion
}


/**
 * Get an option
 * @param {string} option Option
 * @return {*} Value (no filter, could return undefined, null, whatever)
 */
CtcpPlugin.prototype.getOption = function(option){
  var that = this
  return that.options[option]
}


/**
 * Set an option
 * @param {string} option Option
 * @param {*} value Value
 */
CtcpPlugin.prototype.setOption = function(option,value){
  var that = this
  if('version' === option) value = that.mkVersion(value)
  //use magic 'versionRaw' option to bypass the above convenience
  if('versionRaw' === option) option = 'version'
  debug('setting options[\''+option+'\'] = ' + value)
  that.options[option] = value
}


/**
 * Build a version string
 * @param {string} appName Application name (middle section of the "colon standard")
 * @return {string}
 */
CtcpPlugin.prototype.mkVersion = function(appName){
  var that = this
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
CtcpPlugin.prototype.payloadEncode = function(direction,target,type,params){
  var cmd = ('req' === direction) ? 'PRIVMSG' : 'NOTICE'
  var msg = [type.toUpperCase()]
  if(Array.isArray(params)) params.forEach(function(p){msg.push(p)})
  else msg.push(params)
  return [cmd,target,':\x01' + msg.join(' ') + '\x01'].join(' ')
}


/**
 * Checks an incoming message for CTCP payload
 * @param {object} event Event from irc-connect PRIVMSG or NOTICE event
 * @return {boolean}
 */
CtcpPlugin.prototype.isPayload = function(event){
  var message = event.params.slice(1).join(' ') || ''
  return (((message[0] === '+' && message[1] === '\x01') || message[0] === '\x01') && -1 < message.lastIndexOf('\x01'))
}


/**
 * Decode a payload, with detection
 * @param {object} event Event from irc-connect PRIVMSG or NOTICE event
 * @return {object|boolean} Parsed Event, or false if no CTCP payload
 */
CtcpPlugin.prototype.payloadDecode = function(event){
  if(!this.isPayload(event)) return false
  var rv = propCopy(event)
  rv.target = event.params[0]
  var message = event.params[1]
  message = (message[0] === '+') ? message.slice(2) : message.slice(1)
  message = message.slice(0,message.indexOf('\x01'))
  var params = message.split(' ')
  rv.type = params[0].toUpperCase()
  params = params.splice(1)
  rv.params = params
  rv.message = message.replace(/^\S+/,'').replace(/^\s/,'')
  return rv
}

//convenience for below debugs
var debugFmt= function(source,target,type,message){
  var msg = message
  if(Array.isArray(message)) msg = message.join(' ')
  return [source,target,type.toUpperCase(),'[' + msg + ']'].join(' ')
}


/**
 * Send a CTCP Request
 * @param {string} target Target
 * @param {string} type CTCP Type
 * @param {Array} params CTCP Parameters
 */
CtcpPlugin.prototype.sendRequest = function(target,type,params){
  var that = this
  debug('send CTCP_REQUEST ' + debugFmt(that.client.nick(),target,type,params))
  that.client.send(this.payloadEncode('req',target,type.toUpperCase(),params))
}


/**
 * Send a CTCP Response
 * @param {string} target Target
 * @param {string} type CTCP Type
 * @param {Array} params CTCP Parameters
 */
CtcpPlugin.prototype.sendResponse = function(target,type,params){
  var that = this
  debug('send CTCP_RESPONSE ' + debugFmt(that.client.nick(),target,type,params))
  that.client.send(this.payloadEncode('res',target,type.toUpperCase(),params))
}


/**
 * Receive a CTCP Request, emit decoded event
 * @param {object} event Event from irc-connect PRIVMSG event
 * @return {void} to ignore non-CTCP payload
 */
CtcpPlugin.prototype.recvRequest = function(event){
  var that = this
  if(!that.isPayload(event)) return
  var c = that.payloadDecode(event)
  debug('recv CTCP_REQUEST ' + debugFmt(c.nick,c.target,c.type,c.message))
  if('PING' === c.type){that.sendResponse(c.nick,c.type,c.params[0])}
  if('TIME' === c.type){that.sendResponse(c.nick,c.type,moment().format('ddd MMM DD HH:mm:ss YYYY ZZ'))}
  if('VERSION' === c.type && that.options.version){
    if(that.defaultVersion === that.options.version)
      debug('NOTE: you should set a version using irc.client.ctcp.setOption(), replying with default')
    that.sendResponse(c.nick,c.type,that.options.version)
  }
  that.client.emit('ctcp_request',{
    nick: c.nick,
    user: c.user,
    host: c.host,
    type: c.type,
    params: c.params,
    message: c.message
  })
}


/**
 * Receive a CTCP Response, emit decoded event
 * @param {object} event Event from irc-connect NOTICE event
 * @return {void} to ignore non-CTCP payload
 */
CtcpPlugin.prototype.recvResponse = function(event){
  var that = this
  if(!that.isPayload(event)) return
  var c = that.payloadDecode(event)
  debug('recv CTCP_RESPONSE ' + debugFmt(c.nick,c.target,c.type,c.params))
  that.client.emit('ctcp_response',{
    nick: c.nick,
    user: c.user,
    host: c.host,
    type: c.type,
    params: c.params,
    message: c.message
  })
}


/**
 * Export irc-connect plugin definition
 * @type {object}
 * @return {void} fire escape
 */
exports = module.exports = {
  dcc: TypeDcc,
  __irc: function(client){
    var ctcp = new CtcpPlugin(client)
    if(!ctcp) return
    client.ctcp = ctcp
    //client function bindery
    client.isCtcp = ctcp.isPayload.bind(ctcp)
    client.sendCtcpRequest = ctcp.sendRequest.bind(ctcp)
    client.sendCtcpResponse = ctcp.sendResponse.bind(ctcp)
    //client event hooks
    client
      .on('PRIVMSG', ctcp.recvRequest.bind(ctcp))
      .on('NOTICE', ctcp.recvResponse.bind(ctcp))
    debug('Plugin registered')
  }
}
