'use strict';
var debug = require('debug')('irc:ctcp')
var moment = require('moment')

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
  that.options.version = 'undefined'
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
  that.options[option] = value
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


/**
 * Send a CTCP Request
 * @param {string} target Target
 * @param {string} type CTCP Type
 * @param {Array} params CTCP Parameters
 */
CtcpPlugin.prototype.sendRequest = function(target,type,params){
  var that = this
  debug('send CTCP_RESPONSE',that.client.nick(),target,type.toUpperCase(),params)
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
  debug('send CTCP_RESPONSE',that.client.nick(),target,type.toUpperCase(),params)
  that.client.send(this.payloadEncode('res',target,type.toUpperCase(),params))
}


/**
 * Receive a CTCP Request, emit decoded event
 * @param {object} event Event from irc-connect PRIVMSG event
 * @return {void} to ignore non-CTCP payload
 */
CtcpPlugin.prototype.recvRequest = function(event){
  if(!this.isPayload(event)) return
  var c = this.payloadDecode(event)
  debug('recv CTCP_REQUEST',c.nick,c.target,c.type,c.params)
  if('PING' === c.type){this.sendResponse(c.nick,c.type,c.params[0])}
  if('TIME' === c.type){this.sendResponse(c.nick,c.type,moment().format('ddd MMM DD HH:mm:ss YYYY ZZ'))}
  if('VERSION' === c.type && this.options.version){this.sendResponse(c.nick,c.type,this.options.version)}
  this.client.emit('ctcp_request',{
    nick: c.nick,
    user: c.user,
    host: c.host,
    command: 'CTCP_REQUEST',
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
  if(!this.isPayload(event)) return
  var c = this.payloadDecode(event)
  debug('recv CTCP_RESPONSE',c.nick,c.target,c.type,c.params)
  this.client.emit('ctcp_response',{
    nick: c.nick,
    user: c.user,
    host: c.host,
    command: 'CTCP_RESPONSE',
    type: c.type,
    params: c.params,
    message: c.message
  })
}


/**
 * Export irc-connect plugin definition
 * @type {object}
 */
exports = module.exports = {
  __irc: function(client){
    var ctcp = new CtcpPlugin(client)
    client.ctcp = ctcp
    //client function bindery
    client.isCtcp = ctcp.isPayload.bind(ctcp)
    client.sendCtcpRequest = ctcp.sendRequest.bind(ctcp)
    client.sendCtcpResponse = ctcp.sendResponse.bind(ctcp)
    //client event hooks
    client
      .on('PRIVMSG', ctcp.recvRequest.bind(ctcp))
      .on('NOTICE', ctcp.recvResponse.bind(ctcp))
  }
}
