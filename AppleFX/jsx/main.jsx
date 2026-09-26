/*
 * AppleFX - host loader. Loads the host script for the running application.
 * (The panel also loads the right file itself if this ever fails.)
 */
(function () {
  try {
    var dir = File($.fileName).parent.fsName;
    var file = (BridgeTalk.appName === 'aftereffects') ? '/host_ae.jsx' : '/host.jsx';
    $.evalFile(dir + file);
  } catch (e) {}
})();
