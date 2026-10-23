// C# source of Gabay's native helper. Compiled once on the user's PC with the C# compiler that ships with Windows
// (.NET Framework 4.x), against the Windows Runtime metadata in System32\WinMetadata, and cached in userData/bin.
// Keep it free of backticks and "${" (it lives in a template literal).
//
// Protocol, one line each way:
//   pushes   fs 0 | fs 1 L T R B        full screen on some monitor (physical pixels)
//            media <json|null>          now playing, on change (art only when the track changes)
//            note <json>                a new Windows notification (only while notes are on)
//            notedismiss <id> | noteopen <id>   remove a notification from Windows, or open the app it came from
//            noteaccess <status>        whether Windows lets Gabay read notifications (Allowed, Denied, ...)
//   requests <id> <command> [args]  ->  r <id> <json>
//            vol <0-100> | volget | media toggle|next|prev | bt | notes on|off
//            appbar L T R B H | appbar off   (reserve a band at the top of a monitor, physical pixels)
//            clipok                          (false when the copying app asked to keep it out of clipboard history)
//            clipseq                         (clipboard sequence number: changes on every copy)
//            mixer | appvol <pid> <0-100>    (per-app volume)
//            seek <seconds>                  (now playing)
//            wins on|off | windows           (open windows: pushed on change while on, or asked for)
//            focus <h> | minimize <h>        (switch to / minimize an open window)
//            tbget | tbset <0|1> [restore]   (the Windows taskbar's auto-hide; restore is applied when Gabay exits)
//   pushes   priv <json>                     camera / microphone in use, and by which apps
//            wins <json>                     open windows, in z-order, while wins is on
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
interface IMMDeviceEnumeratorAny {
  void EnumAudioEndpoints(int dataFlow, int stateMask, out IMMDeviceCollection devices);
  void GetDefaultAudioEndpoint(int dataFlow, int role, out IMMDeviceAny endpoint);
}
[ComImport, Guid("0BD7A1BE-7A1A-44DB-8397-CC5392387B5E"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDeviceCollection { void GetCount(out uint n); void Item(uint i, out IMMDeviceAny device); }
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

// Camera in use: Media Foundation's sensor activity monitor reports which processes are streaming from each camera.
// (Windows stopped keeping the privacy record in the registry up to date, so this is the live source.)
[ComImport, Guid("DE5072EE-DBE3-46DC-8A87-B6F631194751"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMFSensorActivitiesReportCallback { [PreserveSig] int OnActivitiesReport(IMFSensorActivitiesReport report); }
[ComImport, Guid("683F7A5E-4A19-43CD-B1A9-DBF4AB3F7777"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMFSensorActivitiesReport { void GetCount(out uint n); void GetActivityReport(uint i, out IMFSensorActivityReport r); }
[ComImport, Guid("3E8C4BE1-A8C2-4528-90DE-2851BDE5FEAD"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMFSensorActivityReport {
  void GetFriendlyName(IntPtr buf, uint cch, out uint written);
  void GetSymbolicLink(IntPtr buf, uint cch, out uint written);
  void GetProcessCount(out uint n);
  void GetProcessActivity(uint i, out IMFSensorProcessActivity a);
}
[ComImport, Guid("39DC7F4A-B141-4719-813C-A7F46162A2B8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMFSensorProcessActivity { void GetProcessId(out uint pid); void GetStreamingState([MarshalAs(UnmanagedType.Bool)] out bool on); }
[ComImport, Guid("D0CEF145-B3F4-4340-A2E5-7A5080CA05CB"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMFSensorActivityMonitor { void Start(); void Stop(); }

[ComVisible(true), ClassInterface(ClassInterfaceType.None)]
class CameraWatch : IMFSensorActivitiesReportCallback {
  public volatile uint[] Streaming = new uint[0];
  public Action Changed;
  public int OnActivitiesReport(IMFSensorActivitiesReport report) {
    try {
      var pids = new List<uint>();
      uint n; report.GetCount(out n);
      for (uint i = 0; i < n; i++) {
        IMFSensorActivityReport r; report.GetActivityReport(i, out r);
        uint pc; r.GetProcessCount(out pc);
        for (uint j = 0; j < pc; j++) {
          IMFSensorProcessActivity a; r.GetProcessActivity(j, out a);
          bool on; a.GetStreamingState(out on);
          uint pid; a.GetProcessId(out pid);
          if (on && !pids.Contains(pid)) pids.Add(pid);
        }
      }
      Streaming = pids.ToArray();
      if (Changed != null) Changed();
    } catch { }
    return 0;
  }
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

// A hidden window that Windows tells about top-level windows opening, closing, being activated or flashing for
// attention (the same "shell hook" messages the taskbar gets), so the open-apps list needs no polling.
class ShellWatch : Form {
  [DllImport("user32.dll")] static extern bool RegisterShellHookWindow(IntPtr h);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern uint RegisterWindowMessage(string s);
  readonly uint msg = RegisterWindowMessage("SHELLHOOK");
  public Action<int, IntPtr> OnShell;
  public ShellWatch() { FormBorderStyle = FormBorderStyle.None; ShowInTaskbar = false; }
  protected override CreateParams CreateParams {
    get { var p = base.CreateParams; p.ExStyle |= 0x80; return p; } // WS_EX_TOOLWINDOW
  }
  public void Watch() { RegisterShellHookWindow(Handle); }
  protected override void WndProc(ref Message m) {
    if (m.Msg == (int)msg && OnShell != null) { try { OnShell(m.WParam.ToInt32(), m.LParam); } catch { } }
    base.WndProc(ref m);
  }
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
  delegate bool EnumProc(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] static extern bool IsWindow(IntPtr h);
  [DllImport("user32.dll")] static extern bool IsIconic(IntPtr h);
  [DllImport("user32.dll")] static extern IntPtr GetWindow(IntPtr h, uint cmd);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] static extern int GetWindowTextLength(IntPtr h);
  [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc f, IntPtr l);
  [DllImport("user32.dll")] static extern bool EnumChildWindows(IntPtr p, EnumProc f, IntPtr l);
  [DllImport("user32.dll")] static extern bool ShowWindow(IntPtr h, int cmd);
  [DllImport("user32.dll")] static extern bool ShowWindowAsync(IntPtr h, int cmd);
  [DllImport("user32.dll")] static extern bool PostMessage(IntPtr h, uint msg, IntPtr w, IntPtr l);
  [DllImport("mfsensorgroup.dll")] static extern int MFCreateSensorActivityMonitor(IMFSensorActivitiesReportCallback cb, out IMFSensorActivityMonitor m);
  [DllImport("mfplat.dll")] static extern int MFStartup(uint version, uint flags);
  [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] static extern bool BringWindowToTop(IntPtr h);
  [DllImport("user32.dll")] static extern bool AttachThreadInput(uint a, uint b, bool attach);
  [DllImport("kernel32.dll")] static extern uint GetCurrentThreadId();
  [DllImport("user32.dll")] static extern void keybd_event(byte vk, byte scan, uint flags, UIntPtr extra);
  [DllImport("dwmapi.dll")] static extern int DwmGetWindowAttribute(IntPtr h, int attr, out int value, int size);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern IntPtr FindWindow(string cls, string name);
  [StructLayout(LayoutKind.Sequential)] struct APPBARDATA { public int cbSize; public IntPtr hWnd; public uint uCallbackMessage; public uint uEdge; public RECT rc; public IntPtr lParam; }
  [DllImport("shell32.dll")] static extern UIntPtr SHAppBarMessage(uint msg, ref APPBARDATA d);

  static readonly object outLock = new object();
  static volatile bool fsActive; // a full-screen app is in front (set by the main loop)
  [StructLayout(LayoutKind.Sequential)] struct LASTINPUTINFO { public uint cbSize; public uint dwTime; }
  [DllImport("user32.dll")] static extern bool GetLastInputInfo(ref LASTINPUTINFO info);
  /** Milliseconds since the last key press or mouse move anywhere. */
  static uint IdleMs() {
    var li = new LASTINPUTINFO(); li.cbSize = (uint)Marshal.SizeOf(typeof(LASTINPUTINFO));
    return GetLastInputInfo(ref li) ? (uint)Environment.TickCount - li.dwTime : 0;
  }
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
        if (now != null) fsActive = now.StartsWith("fs 1");
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
    if (r.L <= m.L && r.T <= m.T && r.R >= m.R && r.B >= m.B) return "fs 1 " + m.L + " " + m.T + " " + m.R + " " + m.B + " " + (MouseCaptured(m) ? 1 : 0);
    return "fs 0";
  }

  // A game that is aiming has hidden the pointer or locked it to its window; its "pointer" then drifts to the screen
  // edges as the player looks around, which must never count as pointing at the notch.
  [StructLayout(LayoutKind.Sequential)] struct CURSORINFO { public int cbSize, flags; public IntPtr hCursor; public int x, y; }
  [DllImport("user32.dll")] static extern bool GetCursorInfo(ref CURSORINFO ci);
  [DllImport("user32.dll")] static extern bool GetClipCursor(out RECT r);
  static bool MouseCaptured(RECT m) {
    try {
      var ci = new CURSORINFO(); ci.cbSize = Marshal.SizeOf(typeof(CURSORINFO));
      if (GetCursorInfo(ref ci) && ((ci.flags & 1) == 0 || ci.hCursor == IntPtr.Zero)) return true; // hidden: ShowCursor(false), or SetCursor(NULL) as most games do
      RECT c;
      if (GetClipCursor(out c) && c.R - c.L > 0 && (c.L > m.L || c.T > m.T || c.R < m.R || c.B < m.B)) return true; // locked to less than the monitor
    } catch { }
    return false;
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
    // Gabay closed our stdin: it is gone. Give the reserved space back, and the taskbar setting, before leaving.
    try { if (band != null) band.Invoke((Action)(() => band.Release())); } catch { }
    try { if (tbRestore >= 0) TaskbarAutoHide(tbRestore == 1); } catch { }
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
      case "notedismiss": {
        try { noteListener.RemoveNotification(uint.Parse(arg)); return "true"; } catch { return "false"; }
      }
      case "noteopen": {
        string aumid = null;
        lock (noteApps) { noteApps.TryGetValue(uint.Parse(arg), out aumid); }
        // only an app id made of the characters app ids use, so nothing else can reach the command line
        if (aumid == null || !System.Text.RegularExpressions.Regex.IsMatch(aumid, @"^[A-Za-z0-9._!\-]{1,200}$")) return "false";
        try { System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo("explorer.exe", "shell:AppsFolder\\" + aumid) { UseShellExecute = false }); return "true"; } catch { return "false"; }
      }
      case "appbar": return AppBar(arg);
      case "clipok": return ClipOk() ? "true" : "false";
      case "clipseq": return GetClipboardSequenceNumber().ToString();
      case "mixer": return Mixer();
      case "appvol": { var a = arg.Split(' '); return AppVolume(uint.Parse(a[0]), Math.Max(0, Math.Min(100, int.Parse(a[1]))) / 100f) ? "true" : "false"; }
      case "seek": return Seek(double.Parse(arg, System.Globalization.CultureInfo.InvariantCulture)) ? "true" : "false";
      case "wins": {
        if (arg == "on") { if (shell == null) StartShell(); winsOn = true; lastWins = null; winTimer.Change(0, Timeout.Infinite); }
        else winsOn = false;
        return "true";
      }
      case "windows": return Windows();
      case "focus": return Focus(new IntPtr(long.Parse(arg))) ? "true" : "false";
      case "close": {
        var h = new IntPtr(long.Parse(arg));
        return IsWindow(h) && Listable(h) && PostMessage(h, 0x0010, IntPtr.Zero, IntPtr.Zero) ? "true" : "false"; // WM_CLOSE
      }
      case "minimize": {
        var h = new IntPtr(long.Parse(arg));
        return IsWindow(h) && Listable(h) && ShowWindowAsync(h, 6) ? "true" : "false"; // SW_MINIMIZE
      }
      case "tbget": return TaskbarAutoHide() ? "true" : "false";
      case "net": return "\"" + Net() + "\"";
      case "hw": return Hardware();
      case "dnd": return WindowsDnd() ? "true" : "false";
      case "tbset": {
        // tbset <0|1> [restore 0|1]: the restore value is put back if Gabay goes away without saying so.
        var a = arg.Split(' ');
        tbRestore = a.Length > 1 ? (a[1] == "1" ? 1 : 0) : -1;
        TaskbarAutoHide(a[0] == "1");
        return "true";
      }
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

  // Reading every app's entry each second cost more CPU than the rest of the helper together, so that record is read
  // only when Windows reports a change under ConsentStore (an app starting or stopping the camera or mic), with a
  // re-check each minute as a safety net. Windows doesn't always keep that record up to date, so the microphone is
  // also checked directly: any app recording from an input device right now (a cheap check, every 1.5 s while someone
  // is at the PC).
  static IMFSensorActivityMonitor camMonitor; // kept alive for as long as the helper runs
  static void PrivacyLoop() {
    IntPtr store;
    bool watching = RegOpenKeyEx(new IntPtr(unchecked((int)0x80000001)), // HKEY_CURRENT_USER
      @"Software\Microsoft\Windows\CurrentVersion\CapabilityAccessManager\ConsentStore", 0, 0x0010 /* KEY_NOTIFY */, out store) == 0;
    var changed = new AutoResetEvent(false);
    // Live camera use; a report wakes the loop at once.
    CameraWatch cams = null;
    try {
      MFStartup(0x00020070, 0);
      var cw = new CameraWatch(); cw.Changed = () => changed.Set();
      IMFSensorActivityMonitor mon;
      if (MFCreateSensorActivityMonitor(cw, out mon) == 0) { mon.Start(); cams = cw; camMonitor = mon; }
    } catch { }
    bool armed = false, dirty = true;
    var regMic = new List<string>(); var regCam = new List<string>();
    DateTime nextRead = DateTime.MinValue;
    string last = null;
    while (true) {
      if (dirty || DateTime.UtcNow >= nextRead) {
        // Arm the notification before reading, so a change during the read still wakes the next wait.
        if (watching && !armed) {
          if (RegNotifyChangeKeyValue(store, true, 0x1 | 0x4 /* names, values */, changed.SafeWaitHandle.DangerousGetHandle(), true) == 0) armed = true;
          else watching = false;
        }
        try { regMic = InUse("microphone"); regCam = InUse("webcam"); } catch { }
        dirty = false;
        nextRead = DateTime.UtcNow.AddSeconds(watching ? 60 : 2);
      }
      var mic = new List<string>(regMic);
      try { foreach (var n in Recording()) if (!mic.Contains(n)) mic.Add(n); } catch { }
      var cam = new List<string>(regCam);
      if (cams != null) foreach (var pid in cams.Streaming) {
        if (pid == 0) continue;
        string p = ProcPath(pid);
        string name = p == null ? "An app" : System.IO.Path.GetFileNameWithoutExtension(p);
        if (!cam.Contains(name)) cam.Add(name);
      }
      string now = "{\"mic\":" + Names(mic) + ",\"cam\":" + Names(cam) + "}";
      if (now != last) { Send("priv " + now); last = now; }
      int wait = fsActive || IdleMs() > 60000 ? 5000 : 1500;
      if (watching ? changed.WaitOne(wait) : false) {
        armed = false; dirty = true;
        Thread.Sleep(150); // let a burst of writes settle before reading
      } else if (!watching) Thread.Sleep(wait);
    }
  }

  // Apps with an active recording session on any input device, by name.
  static List<string> Recording() {
    var found = new List<string>();
    var en = new MMDeviceEnumeratorComObject() as IMMDeviceEnumeratorAny;
    IMMDeviceCollection col; en.EnumAudioEndpoints(1 /* capture */, 1 /* active */, out col);
    uint n; col.GetCount(out n);
    var iid = typeof(IAudioSessionManager2).GUID;
    for (uint i = 0; i < n; i++) {
      try {
        IMMDeviceAny dev; col.Item(i, out dev);
        object o; dev.Activate(ref iid, 23, IntPtr.Zero, out o);
        IAudioSessionEnumerator se; ((IAudioSessionManager2)o).GetSessionEnumerator(out se);
        int c; se.GetCount(out c);
        for (int j = 0; j < c; j++) {
          try {
            IAudioSessionControl2 s; se.GetSession(j, out s);
            int state; s.GetState(out state);
            if (state != 1) continue; // only sessions recording right now
            uint pid; s.GetProcessId(out pid);
            if (pid == 0) continue;
            string p = ProcPath(pid);
            string name = p == null ? "An app" : System.IO.Path.GetFileNameWithoutExtension(p);
            if (!found.Contains(name)) found.Add(name);
          } catch { }
        }
      } catch { }
    }
    return found;
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

  // Taskbar rules: visible, unowned, not a tool window, not cloaked (another desktop, a suspended Store app), titled.
  static bool Listable(IntPtr h) {
    if (!IsWindowVisible(h) || GetWindow(h, 4) != IntPtr.Zero) return false; // owned popups belong to their owner
    if ((GetWindowLong(h, -20) & 0x80) != 0) return false; // WS_EX_TOOLWINDOW
    int cloaked; if (DwmGetWindowAttribute(h, 14, out cloaked, 4) == 0 && cloaked != 0) return false;
    if (GetWindowTextLength(h) == 0) return false;
    string c = ClassOf(h);
    return c != "Progman" && c != "Shell_TrayWnd" && c != "Shell_SecondaryTrayWnd" && c != "Windows.UI.Core.CoreWindow";
  }

  static ShellWatch shell;
  static volatile bool winsOn;
  static string lastWins;
  static readonly object winLock = new object();
  static readonly HashSet<long> flashing = new HashSet<long>();
  static long lastActive; // the last window someone used that isn't Gabay: clicking it in Gabay minimizes it
  static readonly System.Threading.Timer winTimer = new System.Threading.Timer(_ => PushWindows(), null, Timeout.Infinite, Timeout.Infinite);

  static void StartShell() {
    IntPtr fg = GetForegroundWindow(); uint fp; GetWindowThreadProcessId(fg, out fp);
    if (fp != self) lastActive = fg.ToInt64();
    var ready = new ManualResetEvent(false);
    var th = new Thread(() => { shell = new ShellWatch(); var unused = shell.Handle; shell.OnShell = OnShell; shell.Watch(); ready.Set(); Application.Run(); });
    th.SetApartmentState(ApartmentState.STA);
    th.IsBackground = true;
    th.Start();
    ready.WaitOne();
  }

  static void OnShell(int code, IntPtr h) {
    long id = h.ToInt64();
    lock (winLock) {
      if (code == 0x8006) flashing.Add(id); // HSHELL_FLASH: an app wants attention (the taskbar's orange button)
      else if ((code & 0x7FFF) == 4) { // HSHELL_WINDOWACTIVATED (and the "rude" variant)
        uint pid; GetWindowThreadProcessId(h, out pid);
        if (h != IntPtr.Zero && pid != self) lastActive = id;
        flashing.Remove(id);
      } else if (code == 2) flashing.Remove(id); // destroyed
    }
    // Several messages arrive together (open, activate, retitle): one list a moment later covers them.
    if (winsOn) winTimer.Change(120, Timeout.Infinite);
  }

  static void PushWindows() {
    if (!winsOn) return;
    try {
      string now = Windows();
      if (now != lastWins) { lastWins = now; Send("wins " + now); }
    } catch { }
  }

  static string Windows() {
    var sb = new StringBuilder("[");
    bool first = true;
    long active; HashSet<long> flash;
    lock (winLock) { active = lastActive; flash = new HashSet<long>(flashing); }
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
      long id = h.ToInt64();
      if (!first) sb.Append(',');
      first = false;
      sb.Append("{\"h\":\"").Append(id).Append("\",\"t\":").Append(J(t.ToString()))
        .Append(",\"p\":").Append(J(ProcPath(pid))).Append(",\"min\":").Append(IsIconic(h) ? "true" : "false")
        .Append(",\"fg\":").Append(id == active ? "true" : "false")
        .Append(",\"flash\":").Append(flash.Contains(id) ? "true" : "false").Append('}');
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

  // ---------- the Windows taskbar's own auto-hide setting ----------
  static int tbRestore = -1;
  static bool TaskbarAutoHide() {
    var d = new APPBARDATA(); d.cbSize = Marshal.SizeOf(typeof(APPBARDATA)); d.hWnd = FindWindow("Shell_TrayWnd", null);
    return ((uint)SHAppBarMessage(4, ref d) & 1) != 0; // ABM_GETSTATE, ABS_AUTOHIDE
  }
  static void TaskbarAutoHide(bool on) {
    var d = new APPBARDATA(); d.cbSize = Marshal.SizeOf(typeof(APPBARDATA)); d.hWnd = FindWindow("Shell_TrayWnd", null);
    d.lParam = new IntPtr(on ? 1 : 0);
    SHAppBarMessage(10, ref d); // ABM_SETSTATE
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
  // Access depends on Windows' privacy settings (Settings > Privacy > Notifications), which differ between PCs. It is
  // reported to Gabay and re-checked (every 10 s while blocked, every 30 s while allowed), so turning access on later
  // works without restarting Gabay.
  static UserNotificationListener noteListener;
  static readonly Dictionary<uint, string> noteApps = new Dictionary<uint, string>(); // id -> the app's id only, never text
  static void NotesLoop() {
    UserNotificationListener l;
    try { l = UserNotificationListener.Current; noteListener = l; } catch { Send("noteaccess Unavailable"); return; }
    var seen = new HashSet<uint>();
    bool primed = false;
    string access = null;
    int tick = 0;
    while (true) {
      try {
        if (access != "Allowed" || tick++ % 25 == 0) {
          string status;
          try { status = l.GetAccessStatus().ToString(); } catch { status = "Unavailable"; }
          if (status != access) { access = status; Send("noteaccess " + status); primed = false; seen.Clear(); }
        }
        if (access != "Allowed") { Thread.Sleep(10000); continue; }
        if (!notesOn) { primed = false; seen.Clear(); Thread.Sleep(1000); continue; }
        var list = W(l.GetNotificationsAsync(NotificationKinds.Toast));
        var now = new HashSet<uint>();
        foreach (var n in list) {
          now.Add(n.Id);
          if (!primed || seen.Contains(n.Id)) continue; // what was already there when notes turned on is old news
          string app = null, title = null, body = null;
          try { app = n.AppInfo.DisplayInfo.DisplayName; } catch { }
          try { lock (noteApps) { if (noteApps.Count > 40) noteApps.Clear(); noteApps[n.Id] = n.AppInfo.AppUserModelId; } } catch { }
          try {
            var b = n.Notification.Visual.GetBinding(KnownNotificationBindings.ToastGeneric);
            if (b != null) {
              var t = b.GetTextElements();
              if (t.Count > 0) title = t[0].Text;
              if (t.Count > 1) { var rest = new StringBuilder(); for (int i = 1; i < t.Count; i++) { if (i > 1) rest.Append(' '); rest.Append(t[i].Text); } body = rest.ToString(); }
            }
          } catch { }
          if (title == null && body == null) continue;
          Send("note {\"id\":" + n.Id + ",\"app\":" + J(app) + ",\"title\":" + J(title) + ",\"body\":" + J(body) + "}");
        }
        seen = now;
        primed = true;
      } catch { }
      // Windows offers no notification event to desktop apps, so this asks. Asking costs CPU in proportion to how often,
      // so it asks every 2 s while someone is at the PC, and every 5 s when they've been away a minute or a full-screen
      // app is in front (toasts don't show then anyway).
      Thread.Sleep(fsActive || IdleMs() > 60000 ? 5000 : 2000);
    }
  }

  // ---------- Windows' Do not disturb ----------
  // Read-only: the shell publishes its quiet-hours profile as a WNF state (0 = off). Gabay never changes it.
  [DllImport("ntdll.dll")] static extern int NtQueryWnfStateData(ref ulong name, IntPtr type, IntPtr scope, out uint stamp, byte[] buf, ref int len);
  static bool WindowsDnd() {
    ulong name = 0xd83063ea3bf1c75UL; // WNF_SHEL_QUIETHOURS_ACTIVE_PROFILE_CHANGED
    var b = new byte[4]; int len = 4; uint stamp;
    return NtQueryWnfStateData(ref name, IntPtr.Zero, IntPtr.Zero, out stamp, b, ref len) == 0 && len >= 4 && BitConverter.ToInt32(b, 0) != 0;
  }

  // ---------- network and hardware ----------
  static bool Virtual(System.Net.NetworkInformation.NetworkInterface n) {
    var d = (n.Description + " " + n.Name).ToLowerInvariant();
    foreach (var w in new[] { "virtual", "vmware", "hyper-v", "vethernet", "tap-", "tunnel", "vpn", "wsl", "docker", "tailscale", "wireguard", "loopback", "bluetooth" })
      if (d.Contains(w)) return true;
    return false;
  }
  /** The link the internet goes through: an up adapter with a default gateway, wired first (Windows prefers it too). */
  static string Net() {
    string best = "offline";
    foreach (var n in System.Net.NetworkInformation.NetworkInterface.GetAllNetworkInterfaces()) {
      try {
        if (n.OperationalStatus != System.Net.NetworkInformation.OperationalStatus.Up || Virtual(n)) continue;
        bool gw = false;
        foreach (var g in n.GetIPProperties().GatewayAddresses) {
          var a = g.Address.ToString();
          if (a != "0.0.0.0" && a != "::") { gw = true; break; }
        }
        if (!gw) continue;
        if (n.NetworkInterfaceType == System.Net.NetworkInformation.NetworkInterfaceType.Wireless80211) best = "wifi";
        else return "ethernet";
      } catch { }
    }
    return best;
  }
  /** What this PC has: a battery (laptops) and a Wi-Fi adapter. Desktops often have neither. */
  static string Hardware() {
    var bs = SystemInformation.PowerStatus.BatteryChargeStatus;
    bool battery = (bs & BatteryChargeStatus.NoSystemBattery) == 0 && bs != BatteryChargeStatus.Unknown;
    bool wifi = false;
    foreach (var n in System.Net.NetworkInformation.NetworkInterface.GetAllNetworkInterfaces())
      try { if (n.NetworkInterfaceType == System.Net.NetworkInformation.NetworkInterfaceType.Wireless80211 && !Virtual(n)) wifi = true; } catch { }
    return "{\"battery\":" + (battery ? "true" : "false") + ",\"wifi\":" + (wifi ? "true" : "false") + "}";
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
