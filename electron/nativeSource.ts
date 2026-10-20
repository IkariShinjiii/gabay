// C# source of Gabay's native helper. Compiled once on the user's PC with the C# compiler that ships with Windows
// (.NET Framework 4.x), against the Windows Runtime metadata in System32\WinMetadata, and cached in userData/bin.
// Keep it free of backticks and "${" (it lives in a template literal).
//
// Protocol, one line each way:
//   pushes   fs 0 | fs 1 L T R B        full screen on some monitor (physical pixels)
//            media <json|null>          now playing, on change (art only when the track changes)
//            note <json>                a new Windows notification (only while notes are on)
//   requests <id> <command> [args]  ->  r <id> <json>
//            windows | focus <hwnd> | close <hwnd> | vol <0-100> | volget | media toggle|next|prev | bt | notes on|off
export const NATIVE_SOURCE = String.raw`
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using Windows.Foundation;
using Windows.Media.Control;
using Windows.Storage.Streams;
using Windows.UI.Notifications;
using Windows.UI.Notifications.Management;
using Windows.Devices.Enumeration;
using Windows.Devices.Bluetooth;

[Guid("5CDF2C82-841E-4546-9722-0CF74078229A"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IAudioEndpointVolume {
  int f(); int g(); int h(); int i();
  int SetMasterVolumeLevelScalar(float fLevel, Guid pguidEventContext);
  int j();
  int GetMasterVolumeLevelScalar(out float pfLevel);
  int k(); int l(); int m(); int n();
  int SetMute([MarshalAs(UnmanagedType.Bool)] bool bMute, Guid pguidEventContext);
  int GetMute(out bool pbMute);
}
[Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDevice { int Activate(ref Guid id, int clsCtx, int activationParams, out IAudioEndpointVolume aev); }
[Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDeviceEnumerator { int f(); int GetDefaultAudioEndpoint(int dataFlow, int role, out IMMDevice endpoint); }
[ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")] class MMDeviceEnumeratorComObject { }

static class Native {
  [StructLayout(LayoutKind.Sequential)] struct RECT { public int L, T, R, B; }
  [StructLayout(LayoutKind.Sequential)] struct MONITORINFO { public int cbSize; public RECT rcMonitor; public RECT rcWork; public uint dwFlags; }
  delegate bool EnumProc(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] static extern bool SetProcessDPIAware();
  [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] static extern IntPtr GetShellWindow();
  [DllImport("user32.dll")] static extern IntPtr GetDesktopWindow();
  [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] static extern bool IsWindow(IntPtr h);
  [DllImport("user32.dll")] static extern bool IsIconic(IntPtr h);
  [DllImport("user32.dll")] static extern int GetWindowLong(IntPtr h, int i);
  [DllImport("user32.dll")] static extern IntPtr GetWindow(IntPtr h, uint cmd);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] static extern IntPtr MonitorFromWindow(IntPtr h, uint flags);
  [DllImport("user32.dll")] static extern bool GetMonitorInfo(IntPtr m, ref MONITORINFO mi);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetClassName(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] static extern int GetWindowTextLength(IntPtr h);
  [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc f, IntPtr l);
  [DllImport("user32.dll")] static extern bool EnumChildWindows(IntPtr p, EnumProc f, IntPtr l);
  [DllImport("user32.dll")] static extern bool ShowWindow(IntPtr h, int cmd);
  [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] static extern bool BringWindowToTop(IntPtr h);
  [DllImport("user32.dll")] static extern bool AttachThreadInput(uint a, uint b, bool attach);
  [DllImport("kernel32.dll")] static extern uint GetCurrentThreadId();
  [DllImport("user32.dll")] static extern void keybd_event(byte vk, byte scan, uint flags, UIntPtr extra);
  [DllImport("user32.dll")] static extern bool PostMessage(IntPtr h, uint msg, IntPtr w, IntPtr l);
  [DllImport("dwmapi.dll")] static extern int DwmGetWindowAttribute(IntPtr h, int attr, out int value, int size);
  [DllImport("kernel32.dll")] static extern IntPtr OpenProcess(uint access, bool inherit, uint pid);
  [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr h);
  [DllImport("kernel32.dll", CharSet = CharSet.Unicode)] static extern bool QueryFullProcessImageName(IntPtr h, int flags, StringBuilder s, ref int size);

  static readonly object outLock = new object();
  static uint self;
  static volatile bool notesOn;

  static void Send(string line) { lock (outLock) { Console.Out.WriteLine(line); Console.Out.Flush(); } }

  static T W<T>(IAsyncOperation<T> op) {
    var until = DateTime.UtcNow.AddSeconds(5);
    while (op.Status == AsyncStatus.Started) { if (DateTime.UtcNow > until) { op.Cancel(); throw new TimeoutException(); } Thread.Sleep(5); }
    return op.GetResults();
  }

  static string J(string s) {
    if (s == null) return "null";
    var b = new StringBuilder("\"");
    foreach (char c in s) {
      if (c == '"') b.Append("\\\""); else if (c == '\\') b.Append("\\\\");
      else if (c < ' ') b.Append("\\u").Append(((int)c).ToString("x4"));
      else b.Append(c);
    }
    return b.Append('"').ToString();
  }

  static void Main(string[] args) {
    SetProcessDPIAware();
    self = args.Length > 0 ? uint.Parse(args[0]) : 0;
    new Thread(ReadCommands) { IsBackground = true }.Start();
    new Thread(MediaLoop) { IsBackground = true }.Start();
    new Thread(NotesLoop) { IsBackground = true }.Start();
    string last = null;
    while (true) {
      try {
        string now = FullScreen();
        if (now != null && now != last) { Send(now); last = now; }
      } catch { }
      Thread.Sleep(400);
    }
  }

  // ---------- full screen: the foreground window covers its monitor and has no title bar ----------
  static string FullScreen() {
    IntPtr h = GetForegroundWindow();
    if (h == IntPtr.Zero || h == GetShellWindow() || h == GetDesktopWindow() || !IsWindowVisible(h)) return "fs 0";
    uint pid; GetWindowThreadProcessId(h, out pid);
    if (pid == self) return null;
    string c = ClassOf(h);
    if (c == "Progman" || c == "WorkerW" || c == "Shell_TrayWnd") return "fs 0";
    if ((GetWindowLong(h, -16) & 0x00C00000) == 0x00C00000) return "fs 0";
    RECT r; if (!GetWindowRect(h, out r)) return "fs 0";
    var mi = new MONITORINFO(); mi.cbSize = Marshal.SizeOf(typeof(MONITORINFO));
    if (!GetMonitorInfo(MonitorFromWindow(h, 2), ref mi)) return "fs 0";
    var m = mi.rcMonitor;
    if (r.L <= m.L && r.T <= m.T && r.R >= m.R && r.B >= m.B) return "fs 1 " + m.L + " " + m.T + " " + m.R + " " + m.B;
    return "fs 0";
  }

  static string ClassOf(IntPtr h) { var s = new StringBuilder(128); GetClassName(h, s, 128); return s.ToString(); }

  // ---------- commands ----------
  static void ReadCommands() {
    try {
      string line;
      while ((line = Console.In.ReadLine()) != null) {
        var parts = line.Split(new[] { ' ' }, 3);
        if (parts.Length < 2) continue;
        string id = parts[0], cmd = parts[1], arg = parts.Length > 2 ? parts[2] : "";
        string reply;
        try { reply = Run(cmd, arg); } catch { reply = "null"; }
        Send("r " + id + " " + reply);
      }
    } catch { }
    Environment.Exit(0); // Gabay closed our stdin: it is gone
  }

  static string Run(string cmd, string arg) {
    switch (cmd) {
      case "windows": return Windows();
      case "focus": return Focus(new IntPtr(long.Parse(arg))) ? "true" : "false";
      case "close": {
        var h = new IntPtr(long.Parse(arg));
        return IsWindow(h) && PostMessage(h, 0x0010, IntPtr.Zero, IntPtr.Zero) ? "true" : "false"; // WM_CLOSE
      }
      case "vol": {
        int v = Math.Max(0, Math.Min(100, int.Parse(arg)));
        var ep = Vol(); ep.SetMasterVolumeLevelScalar(v / 100f, Guid.Empty);
        if (v > 0) ep.SetMute(false, Guid.Empty);
        return VolGet();
      }
      case "volget": return VolGet();
      case "media": return MediaCommand(arg) ? "true" : "false";
      case "bt": return Bluetooth();
      case "notes": notesOn = arg == "on"; return "true";
    }
    return "null";
  }

  // ---------- volume ----------
  static IAudioEndpointVolume Vol() {
    var en = new MMDeviceEnumeratorComObject() as IMMDeviceEnumerator;
    IMMDevice dev; en.GetDefaultAudioEndpoint(0, 1, out dev);
    var iid = typeof(IAudioEndpointVolume).GUID;
    IAudioEndpointVolume v; dev.Activate(ref iid, 23, 0, out v);
    return v;
  }
  static string VolGet() {
    var ep = Vol(); float l; bool m; ep.GetMasterVolumeLevelScalar(out l); ep.GetMute(out m);
    return "{\"volume\":" + Math.Round(l * 100) + ",\"muted\":" + (m ? "true" : "false") + "}";
  }

  // ---------- open windows, in z-order (most recently used first) ----------
  static string ProcPath(uint pid) {
    IntPtr p = OpenProcess(0x1000, false, pid); // PROCESS_QUERY_LIMITED_INFORMATION
    if (p == IntPtr.Zero) return null;
    try { var s = new StringBuilder(1024); int n = s.Capacity; return QueryFullProcessImageName(p, 0, s, ref n) ? s.ToString() : null; }
    finally { CloseHandle(p); }
  }

  static bool Listable(IntPtr h) {
    if (!IsWindowVisible(h) || GetWindow(h, 4) != IntPtr.Zero) return false; // owned popups belong to their owner
    if ((GetWindowLong(h, -20) & 0x80) != 0) return false; // WS_EX_TOOLWINDOW
    int cloaked; if (DwmGetWindowAttribute(h, 14, out cloaked, 4) == 0 && cloaked != 0) return false; // other desktops, suspended apps
    if (GetWindowTextLength(h) == 0) return false;
    string c = ClassOf(h);
    return c != "Progman" && c != "Shell_TrayWnd" && c != "Shell_SecondaryTrayWnd" && c != "Windows.UI.Core.CoreWindow";
  }

  static string Windows() {
    var sb = new StringBuilder("[");
    bool first = true;
    IntPtr fg = GetForegroundWindow();
    EnumWindows((h, l) => {
      if (!Listable(h)) return true;
      uint pid; GetWindowThreadProcessId(h, out pid);
      if (pid == self) return true;
      // Store apps run inside ApplicationFrameHost; the real app is the child window from another process.
      if (ClassOf(h) == "ApplicationFrameWindow") {
        uint inner = 0, host = pid;
        EnumChildWindows(h, (c, x) => { uint cp; GetWindowThreadProcessId(c, out cp); if (cp != host) { inner = cp; return false; } return true; }, IntPtr.Zero);
        if (inner == 0) return true; // a suspended Store app with no content
        pid = inner;
      }
      var t = new StringBuilder(GetWindowTextLength(h) + 1); GetWindowText(h, t, t.Capacity);
      if (!first) sb.Append(',');
      first = false;
      sb.Append("{\"h\":\"").Append(h.ToInt64()).Append("\",\"t\":").Append(J(t.ToString()))
        .Append(",\"p\":").Append(J(ProcPath(pid))).Append(",\"min\":").Append(IsIconic(h) ? "true" : "false")
        .Append(",\"fg\":").Append(h == fg ? "true" : "false").Append('}');
      return true;
    }, IntPtr.Zero);
    return sb.Append(']').ToString();
  }

  // Windows only lets the foreground app hand focus over. Gabay is in front when this runs (it was just clicked), so
  // join its input queue for the call; if that is refused, a synthetic Alt tap lifts the lock.
  static bool Focus(IntPtr h) {
    if (!IsWindow(h) || !Listable(h)) return false;
    if (IsIconic(h)) ShowWindow(h, 9); // SW_RESTORE
    uint dummy;
    uint fgThread = GetWindowThreadProcessId(GetForegroundWindow(), out dummy);
    uint me = GetCurrentThreadId();
    bool attached = fgThread != 0 && fgThread != me && AttachThreadInput(me, fgThread, true);
    bool ok = SetForegroundWindow(h);
    BringWindowToTop(h);
    if (attached) AttachThreadInput(me, fgThread, false);
    if (!ok || GetForegroundWindow() != h) {
      keybd_event(0x12, 0, 0, UIntPtr.Zero); keybd_event(0x12, 0, 2, UIntPtr.Zero);
      ok = SetForegroundWindow(h);
    }
    return ok;
  }

  // ---------- now playing ----------
  static GlobalSystemMediaTransportControlsSessionManager media;
  static string artKey = "";

  static void MediaLoop() {
    try { media = W(GlobalSystemMediaTransportControlsSessionManager.RequestAsync()); } catch { return; }
    string last = null;
    while (true) {
      try {
        string now = MediaJson();
        if (now != last) { Send("media " + now); last = now; }
      } catch { }
      Thread.Sleep(1000);
    }
  }

  static string MediaJson() {
    var s = media.GetCurrentSession();
    if (s == null) { artKey = ""; return "null"; }
    var p = W(s.TryGetMediaPropertiesAsync());
    var tl = s.GetTimelineProperties();
    bool playing = s.GetPlaybackInfo().PlaybackStatus == GlobalSystemMediaTransportControlsSessionPlaybackStatus.Playing;
    string key = p.Title + "|" + p.Artist;
    var sb = new StringBuilder("{\"title\":").Append(J(p.Title)).Append(",\"artist\":").Append(J(p.Artist))
      .Append(",\"app\":").Append(J(s.SourceAppUserModelId)).Append(",\"playing\":").Append(playing ? "true" : "false")
      .Append(",\"duration\":").Append(Math.Round((tl.EndTime - tl.StartTime).TotalSeconds));
    // Position moves on its own; it is left out so a line is sent only when something a person would notice changes.
    if (key != artKey) {
      artKey = key;
      string art = "";
      try {
        if (p.Thumbnail != null) {
          var st = W(p.Thumbnail.OpenReadAsync());
          if (st.Size > 0 && st.Size <= 400000) {
            var rd = new DataReader(st.GetInputStreamAt(0));
            W(rd.LoadAsync((uint)st.Size));
            var bytes = new byte[st.Size]; rd.ReadBytes(bytes);
            art = (st.ContentType ?? "image/png") + ";base64," + Convert.ToBase64String(bytes);
          }
        }
      } catch { }
      sb.Append(",\"art\":").Append(J(art));
    }
    return sb.Append('}').ToString();
  }

  static bool MediaCommand(string c) {
    if (media == null) return false;
    var s = media.GetCurrentSession();
    if (s == null) return false;
    var op = c == "next" ? s.TrySkipNextAsync() : c == "prev" ? s.TrySkipPreviousAsync() : s.TryTogglePlayPauseAsync();
    return W(op);
  }

  // ---------- notifications: new toasts only, text is never kept ----------
  static void NotesLoop() {
    UserNotificationListener l;
    try { l = UserNotificationListener.Current; if (l.GetAccessStatus() != UserNotificationListenerAccessStatus.Allowed) return; } catch { return; }
    var seen = new HashSet<uint>();
    bool primed = false;
    while (true) {
      try {
        if (!notesOn) { primed = false; seen.Clear(); Thread.Sleep(1000); continue; }
        var list = W(l.GetNotificationsAsync(NotificationKinds.Toast));
        var now = new HashSet<uint>();
        foreach (var n in list) {
          now.Add(n.Id);
          if (!primed || seen.Contains(n.Id)) continue; // what was already there when notes turned on is old news
          string app = null, title = null, body = null;
          try { app = n.AppInfo.DisplayInfo.DisplayName; } catch { }
          try {
            var b = n.Notification.Visual.GetBinding(KnownNotificationBindings.ToastGeneric);
            if (b != null) {
              var t = b.GetTextElements();
              if (t.Count > 0) title = t[0].Text;
              if (t.Count > 1) { var rest = new StringBuilder(); for (int i = 1; i < t.Count; i++) { if (i > 1) rest.Append(' '); rest.Append(t[i].Text); } body = rest.ToString(); }
            }
          } catch { }
          if (title == null && body == null) continue;
          Send("note {\"app\":" + J(app) + ",\"title\":" + J(title) + ",\"body\":" + J(body) + "}");
        }
        seen = now;
        primed = true;
      } catch { }
      Thread.Sleep(1200);
    }
  }

  // ---------- paired Bluetooth devices ----------
  static string Bluetooth() {
    var sb = new StringBuilder("[");
    bool first = true;
    DeviceInformationCollection devs;
    try { devs = W(DeviceInformation.FindAllAsync(BluetoothDevice.GetDeviceSelectorFromPairingState(true))); }
    catch { return "[]"; } // radio off or no adapter
    foreach (var d in devs) {
      bool connected = false;
      try { var b = W(BluetoothDevice.FromIdAsync(d.Id)); connected = b != null && b.ConnectionStatus == BluetoothConnectionStatus.Connected; } catch { }
      if (!first) sb.Append(',');
      first = false;
      sb.Append("{\"name\":").Append(J(d.Name)).Append(",\"connected\":").Append(connected ? "true" : "false").Append('}');
    }
    return sb.Append(']').ToString();
  }
}
`
