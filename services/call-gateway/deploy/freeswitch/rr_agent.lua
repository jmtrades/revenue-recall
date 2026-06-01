-- Reference FreeSWITCH script: bridge an answered call's audio to the in-house
-- call-gateway agent over WebSocket (mod_audio_fork), so the AI listens & speaks.
--
-- TEMPLATE — the exact mod_audio_fork arguments and bidirectional playback
-- depend on your FreeSWITCH / mod_audio_fork build. Confirm against your version
-- (or use Jambonz, which handles WebSocket media ↔ agent natively). The gateway
-- sets `rr_media_ws` on the channel when it originates the call.

local ws = session:getVariable("rr_media_ws")
if not ws then
  freeswitch.consoleLog("ERR", "rr_agent: missing rr_media_ws channel variable\n")
  return
end

session:answer()
session:sleep(200)  -- let media settle

-- Stream 8 kHz mono L16 to the gateway and play the agent's audio back into the
-- call. (Arg order/keywords vary by build — e.g. some use:
--   audio_fork <ws-url> start <metadata-json> <mix-type> <rate>
-- and a separate command to play returned audio. Finalize for your build.)
session:execute("audio_fork", string.format("%s start both 8000 mono", ws))

-- Keep the leg up while the agent runs the conversation; the gateway/agent ends
-- it (or the caller hangs up).
session:execute("park")
