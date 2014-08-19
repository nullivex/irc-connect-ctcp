irc-connect-ctcp
================

CTCP plugin for irc-connect

Basic CTCP support, emits 'ctcp_request' and 'ctcp_response' events.

Currently responds to 'PING', 'TIME', and 'VERSION' requests but is easily extensible.

DCC CHAT and DCC SEND are in development and work well, currently only incoming are supported.
