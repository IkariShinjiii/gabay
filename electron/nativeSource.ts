// C# source of Gabay's native helper. Compiled once on the user's PC with the C# compiler that ships with Windows
// (.NET Framework 4.x), against the Windows Runtime metadata in System32\WinMetadata, and cached in userData/bin.
// Keep it free of backticks and "${" (it lives in a template literal).
//
// Protocol, one line each way:
//   pushes   fs 0 | fs 1 L T R B        full screen on some monitor (physical pixels)
//            media <json|null>          now playing, on change (art only when the track changes)
//            note <json>                a new Windows notification (only while notes are on)
//   requests <id> <command> [args]  ->  r <id> <json>
//            vol <0-100> | volget | media toggle|next|prev | bt | notes on|off
//            appbar L T R B H | appbar off   (reserve a band at the top of a monitor, physical pixels)
//            clipok                          (false when the copying app asked to keep it out of clipboard history)
//            clipseq                         (clipboard sequence number: changes on every copy)
//            mixer | appvol <pid> <0-100>    (per-app volume)
//            seek <seconds>                  (now playing)
//   pushes   priv <json>                     camera / microphone in use, and by which apps
export const NATIVE_SOURCE = String.raw`
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Windows.Forms;
using Microsoft.Win32;
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

// Per-app volume: the same audio sessions the Windows volume mixer lists.
[ComImport, Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDeviceAny { void Activate(ref Guid id, int clsCtx, IntPtr activationParams, [MarshalAs(UnmanagedType.IUnknown)] out object o); }
[ComImport, Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDeviceEnumeratorAny { void f(); void GetDefaultAudioEndpoint(int dataFlow, int role, out IMMDeviceAny endpoint); }
[ComImport, Guid("77AA99A0-1BD6-484F-8BC7-2C654C9A9B6F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IAudioSessionManager2 { void a(); void b(); void GetSessionEnumerator(out IAudioSessionEnumerator e); }
[ComImport, Guid("E2F5BB11-0570-40CA-ACDD-3AA01277DEE8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IAudioSessionEnumerator { void GetCount(out int n); void GetSession(int i, out IAudioSessionControl2 s); }
[ComImport, Guid("bfb7ff88-7239-4fc9-8fa2-07c950be9c6d"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IAudioSessionControl2 {
  void GetState(out int state);
  void GetDisplayName([MarshalAs(UnmanagedType.LPWStr)] out string name);
  void c(); void d(); void e(); void f(); void g(); void h(); void i();
  void GetSessionIdentifier([MarshalAs(UnmanagedType.LPWStr)] out string id);
  void GetSessionInstanceIdentifier([MarshalAs(UnmanagedType.LPWStr)] out string id);
  void GetProcessId(out uint pid);
  [PreserveSig] int IsSystemSoundsSession();
}
// Sessions here refuse ISimpleAudioVolume (E_NOINTERFACE on this Windows build) but take the per-channel one, so the
// app's level is set on every channel and read as the loudest.
[ComImport, Guid("1C158861-B533-4B30-B1CF-E853E51C59B8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IChannelAudioVolume {
  void GetChannelCount(out uint n);
  void SetChannelVolume(uint i, float level, ref Guid ctx);
  void GetChannelVolume(uint i, out float level);
}

// The reserved band: a black, never-activated strip registered as an app bar, so Windows fits maximized and snapped
// windows below it (the same mechanism the taskbar uses). It steps aside while an app is full screen.
class Band : Form {
  [StructLayout(LayoutKind.Sequential)] struct RECT { public int L, T, R, B; }
  [StructLayout(LayoutKind.Sequential)] struct APPBARDATA { public int cbSize; public IntPtr hWnd; public uint uCallbackMessage; public uint uEdge; public RECT rc; public IntPtr lParam; }
  [DllImport("shell32.dll")] static extern UIntPtr SHAppBarMessage(uint msg, ref APPBARDATA d);
  [DllImport("user32.dll")] static extern uint RegisterWindowMessage(string s);
  [DllImport("user32.dll")] static extern bool SetWindowPos(IntPtr h, IntPtr after, int x, int y, int w, int hh, uint flags);
  const uint ABM_NEW = 0, ABM_REMOVE = 1, ABM_QUERYPOS = 2, ABM_SETPOS = 3, ABE_TOP = 1;
  const int ABN_POSCHANGED = 1, ABN_FULLSCREENAPP = 2;
  readonly uint callback = RegisterWindowMessage("GabayAppBar");
  bool registered;
  int l, t, r, b, h;

  public Band() {
    FormBorderStyle = FormBorderStyle.None;
    ShowInTaskbar = false;
    BackColor = System.Drawing.Color.Black;
    StartPosition = FormStartPosition.Manual;
    TopMost = true;
  }
  protected override bool ShowWithoutActivation { get { return true; } }
  protected override CreateParams CreateParams {
    get { var p = base.CreateParams; p.ExStyle |= 0x80 | 0x08000000; return p; } // WS_EX_TOOLWINDOW | WS_EX_NOACTIVATE
  }

  APPBARDATA Data() { var d = new APPBARDATA(); d.cbSize = Marshal.SizeOf(typeof(APPBARDATA)); d.hWnd = Handle; return d; }

  public void Reserve(int l, int t, int r, int b, int h) {
    this.l = l; this.t = t; this.r = r; this.b = b; this.h = h;
    if (!registered) { var d = Data(); d.uCallbackMessage = callback; SHAppBarMessage(ABM_NEW, ref d); registered = true; }
    Place();
    if (!Visible) Show();
  }

  void Place() {
    var d = Data();
    d.uEdge = ABE_TOP;
    d.rc.L = l; d.rc.R = r; d.rc.T = t; d.rc.B = t + h;
    SHAppBarMessage(ABM_QUERYPOS, ref d); // Windows may move it below another top bar
    d.rc.B = d.rc.T + h;
    SHAppBarMessage(ABM_SETPOS, ref d);
    SetWindowPos(Handle, new IntPtr(-1), d.rc.L, d.rc.T, d.rc.R - d.rc.L, h, 0x0010 | 0x0040); // topmost, no activate, show
  }

  public void Release() {
    if (registered) { var d = Data(); SHAppBarMessage(ABM_REMOVE, ref d); registered = false; }
    Hide();
  }

  protected override void WndProc(ref Message m) {
    if (registered && m.Msg == (int)callback) {
      if ((int)m.WParam == ABN_POSCHANGED) Place();
      else if ((int)m.WParam == ABN_FULLSCREENAPP) {
        // Full screen app opened: drop behind it; closed: back on top.
        SetWindowPos(Handle, m.LParam != IntPtr.Zero ? new IntPtr(1) : new IntPtr(-1), 0, 0, 0, 0, 0x0001 | 0x0002 | 0x0010);
      }
    }
    base.WndProc(ref m);
  }

  protected override void OnFormClosing(FormClosingEventArgs e) { Release(); base.OnFormClosing(e); }
}

static class Native {
  [StructLayout(LayoutKind.Sequential)] struct RECT { public int L, T, R, B; }
  [StructLayout(LayoutKind.Sequential)] struct MONITORINFO { public int cbSize; public RECT rcMonitor; public RECT rcWork; public uint dwFlags; }
  [DllImport("user32.dll")] static extern bool SetProcessDPIAware();
  [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] static extern IntPtr GetShellWindow();
  [DllImport("user32.dll")] static extern IntPtr GetDesktopWindow();
  [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] static extern int GetWindowLong(IntPtr h, int i);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] static extern IntPtr MonitorFromWindow(IntPtr h, uint flags);
  [DllImport("user32.dll")] static extern bool GetMonitorInfo(IntPtr m, ref MONITORINFO mi);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetClassName(IntPtr h, StringBuilder s, int n);
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

  static Band band;
  static void StartBand() {
    var ready = new ManualResetEvent(false);
    var th = new Thread(() => { band = new Band(); var unused = band.Handle; ready.Set(); Application.Run(); });
    th.SetApartmentState(ApartmentState.STA);
    th.IsBackground = true;
    th.Start();
    ready.WaitOne();
  }
  static string AppBar(string arg) {
    if (band == null) StartBand();
    if (arg == "off") { band.Invoke((Action)(() => band.Release())); return "true"; }
    var n = arg.Split(' ');
    if (n.Length != 5) return "false";
    int l = int.Parse(n[0]), t = int.Parse(n[1]), r = int.Parse(n[2]), b = int.Parse(n[3]), h = Math.Max(1, Math.Min(80, int.Parse(n[4])));
    band.Invoke((Action)(() => band.Reserve(l, t, r, b, h)));
    return "true";
  }

  static void Main(string[] args) {
    SetProcessDPIAware();
    self = args.Length > 0 ? uint.Parse(args[0]) : 0;
    new Thread(ReadCommands) { IsBackground = true }.Start();
    new Thread(MediaLoop) { IsBackground = true }.Start();
    new Thread(NotesLoop) { IsBackground = true }.Start();
    new Thread(PrivacyLoop) { IsBackground = true }.Start();
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
        // Each request on its own pool thread: a slow one (a Bluetooth scan) must not hold up a window switch.
        ThreadPool.QueueUserWorkItem(_ => {
          string reply;
          try { reply = Run(cmd, arg); } catch { reply = "null"; }
          Send("r " + id + " " + reply);
        });
      }
    } catch { }
    // Gabay closed our stdin: it is gone. Give the reserved space back before leaving.
    try { if (band != null) band.Invoke((Action)(() => band.Release())); } catch { }
    Environment.Exit(0);
  }

  static string Run(string cmd, string arg) {
    switch (cmd) {
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
      case "appbar": return AppBar(arg);
      case "clipok": return ClipOk() ? "true" : "false";
      case "clipseq": return GetClipboardSequenceNumber().ToString();
      case "mixer": return Mixer();
      case "appvol": { var a = arg.Split(' '); return AppVolume(uint.Parse(a[0]), Math.Max(0, Math.Min(100, int.Parse(a[1]))) / 100f) ? "true" : "false"; }
      case "seek": return Seek(double.Parse(arg, System.Globalization.CultureInfo.InvariantCulture)) ? "true" : "false";
    }
    return "null";
  }

  [DllImport("user32.dll")] static extern uint GetClipboardSequenceNumber();

  // ---------- per-app volume ----------
  static List<KeyValuePair<IAudioSessionControl2, uint>> Sessions() {
    var list = new List<KeyValuePair<IAudioSessionControl2, uint>>();
    var en = new MMDeviceEnumeratorComObject() as IMMDeviceEnumeratorAny;
    IMMDeviceAny dev; en.GetDefaultAudioEndpoint(0, 1, out dev);
    var iid = typeof(IAudioSessionManager2).GUID;
    object o; dev.Activate(ref iid, 23, IntPtr.Zero, out o);
    IAudioSessionEnumerator se; ((IAudioSessionManager2)o).GetSessionEnumerator(out se);
    int n; se.GetCount(out n);
    for (int i = 0; i < n; i++) {
      try {
        IAudioSessionControl2 s; se.GetSession(i, out s);
        int state; s.GetState(out state);
        if (state == 2) continue; // expired
        uint pid = 0;
        if (s.IsSystemSoundsSession() != 0) s.GetProcessId(out pid); // system sounds: pid 0
        list.Add(new KeyValuePair<IAudioSessionControl2, uint>(s, pid));
      } catch { } // one odd session must not hide the rest
    }
    return list;
  }

  static string AppName(uint pid, string path) {
    if (pid == 0) return "System sounds";
    if (path == null) return "App " + pid;
    try {
      var d = FileVersionInfo.GetVersionInfo(path).FileDescription;
      if (!string.IsNullOrWhiteSpace(d)) return d.Trim();
    } catch { }
    return System.IO.Path.GetFileNameWithoutExtension(path);
  }

  static string Mixer() {
    var seen = new Dictionary<uint, bool>();
    var sb = new StringBuilder("[");
    bool first = true;
    foreach (var kv in Sessions()) {
      uint pid = kv.Value;
      if (seen.ContainsKey(pid)) continue; // one row per app; setting it sets all its sessions
      seen[pid] = true;
      float l = ChannelLevel((IChannelAudioVolume)kv.Key);
      string path = pid == 0 ? null : ProcPath(pid);
      if (!first) sb.Append(',');
      first = false;
      sb.Append("{\"pid\":").Append(pid).Append(",\"name\":").Append(J(AppName(pid, path)))
        .Append(",\"path\":").Append(J(path)).Append(",\"volume\":").Append(Math.Round(l * 100)).Append('}');
    }
    return sb.Append(']').ToString();
  }

  static float ChannelLevel(IChannelAudioVolume v) {
    uint n; v.GetChannelCount(out n);
    float max = 0;
    for (uint i = 0; i < n; i++) { float c; v.GetChannelVolume(i, out c); if (c > max) max = c; }
    return max;
  }

  static bool AppVolume(uint pid, float level) {
    bool any = false;
    var ctx = Guid.Empty;
    foreach (var kv in Sessions()) {
      if (kv.Value != pid) continue;
      var v = (IChannelAudioVolume)kv.Key;
      uint n; v.GetChannelCount(out n);
      for (uint i = 0; i < n; i++) v.SetChannelVolume(i, level, ref ctx);
      any = true;
    }
    return any;
  }

  // ---------- camera and microphone in use ----------
  // Windows records each app's use under CapabilityAccessManager; LastUsedTimeStop = 0 means "in use right now".
  [DllImport("advapi32.dll", CharSet = CharSet.Unicode)] static extern int RegOpenKeyEx(IntPtr root, string sub, int options, int access, out IntPtr key);
  [DllImport("advapi32.dll")] static extern int RegNotifyChangeKeyValue(IntPtr key, bool subtree, int filter, IntPtr evt, bool async);

  // Reading every app's entry each second cost more CPU than the rest of the helper together, so the loop sleeps until
  // Windows reports a change under ConsentStore (an app starting or stopping the camera or mic), with a re-check each
  // minute as a safety net.
  static void PrivacyLoop() {
    IntPtr store;
    bool watching = RegOpenKeyEx(new IntPtr(unchecked((int)0x80000001)), // HKEY_CURRENT_USER
      @"Software\Microsoft\Windows\CurrentVersion\CapabilityAccessManager\ConsentStore", 0, 0x0010 /* KEY_NOTIFY */, out store) == 0;
    var changed = new AutoResetEvent(false);
    string last = null;
    while (true) {
      // Arm the notification before reading, so a change during the read still wakes the next wait.
      if (watching && RegNotifyChangeKeyValue(store, true, 0x1 | 0x4 /* names, values */, changed.SafeWaitHandle.DangerousGetHandle(), true) != 0) watching = false;
      try {
        var mic = InUse("microphone");
        var cam = InUse("webcam");
        string now = "{\"mic\":" + Names(mic) + ",\"cam\":" + Names(cam) + "}";
        if (now != last) { Send("priv " + now); last = now; }
      } catch { }
      if (watching) changed.WaitOne(60000); else Thread.Sleep(2000);
      Thread.Sleep(150); // let a burst of writes settle before reading
    }
  }
  static string Names(List<string> l) {
    var sb = new StringBuilder("[");
    for (int i = 0; i < l.Count; i++) { if (i > 0) sb.Append(','); sb.Append(J(l[i])); }
    return sb.Append(']').ToString();
  }
  static List<string> InUse(string cap) {
    var found = new List<string>();
    string root = @"Software\Microsoft\Windows\CurrentVersion\CapabilityAccessManager\ConsentStore\" + cap;
    using (var k = Registry.CurrentUser.OpenSubKey(root)) {
      if (k == null) return found;
      foreach (var name in k.GetSubKeyNames()) {
        using (var sub = k.OpenSubKey(name)) {
          if (sub == null) continue;
          if (name == "NonPackaged") {
            foreach (var app in sub.GetSubKeyNames()) {
              using (var a = sub.OpenSubKey(app)) {
                if (a != null && Active(a)) found.Add(System.IO.Path.GetFileNameWithoutExtension(app.Replace('#', '\\')));
              }
            }
          } else if (Active(sub)) {
            int u = name.IndexOf('_');
            found.Add(u > 0 ? name.Substring(0, u) : name);
          }
        }
      }
    }
    return found;
  }
  static bool Active(RegistryKey k) {
    object start = k.GetValue("LastUsedTimeStart"), stop = k.GetValue("LastUsedTimeStop");
    return start is long && (long)start != 0 && stop is long && (long)stop == 0;
  }

  // ---------- clipboard privacy ----------
  // Password managers and private windows tag what they copy so clipboard history skips it. Electron can't see those
  // tags, so Gabay asks here before keeping anything.
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern uint RegisterClipboardFormat(string name);
  [DllImport("user32.dll")] static extern bool IsClipboardFormatAvailable(uint f);
  [DllImport("user32.dll")] static extern bool OpenClipboard(IntPtr h);
  [DllImport("user32.dll")] static extern bool CloseClipboard();
  [DllImport("user32.dll")] static extern IntPtr GetClipboardData(uint f);
  [DllImport("kernel32.dll")] static extern IntPtr GlobalLock(IntPtr h);
  [DllImport("kernel32.dll")] static extern bool GlobalUnlock(IntPtr h);
  static bool ClipOk() {
    if (IsClipboardFormatAvailable(RegisterClipboardFormat("ExcludeClipboardContentFromMonitorProcessing"))) return false;
    uint canInclude = RegisterClipboardFormat("CanIncludeInClipboardHistory");
    if (!IsClipboardFormatAvailable(canInclude)) return true;
    for (int i = 0; i < 5; i++) { if (OpenClipboard(IntPtr.Zero)) break; if (i == 4) return false; Thread.Sleep(20); }
    try {
      IntPtr h = GetClipboardData(canInclude);
      if (h == IntPtr.Zero) return false;
      IntPtr p = GlobalLock(h);
      if (p == IntPtr.Zero) return false;
      try { return Marshal.ReadInt32(p) != 0; } finally { GlobalUnlock(h); }
    } finally { CloseClipboard(); }
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

  // ---------- now playing ----------
  static GlobalSystemMediaTransportControlsSessionManager media;
  static string artKey = "";

  static void MediaLoop() {
    while (media == null) {
      try { media = W(GlobalSystemMediaTransportControlsSessionManager.RequestAsync()); } catch { Thread.Sleep(10000); }
    }
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

  static bool Seek(double seconds) {
    if (media == null) return false;
    var s = media.GetCurrentSession();
    if (s == null) return false;
    var tl = s.GetTimelineProperties();
    long ticks = tl.StartTime.Ticks + (long)(Math.Max(0, seconds) * TimeSpan.TicksPerSecond);
    return W(s.TryChangePlaybackPositionAsync(ticks));
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
