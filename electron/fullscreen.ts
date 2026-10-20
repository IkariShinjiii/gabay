import { app, screen } from 'electron'
import { execFile, spawn, type ChildProcess } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

// Electron can't see other apps' windows, and a resident PowerShell would cost ~60 MB, so a tiny C# watcher is
// compiled once with the C# compiler that ships with Windows (.NET Framework 4.x) and cached in userData. It costs a few
// MB, checks the foreground window every 400 ms and prints a line only when the answer changes.
//
// "Full screen" = the foreground window covers its whole monitor and has no title bar (WS_CAPTION). With an auto-hidden
// taskbar a maximized browser also covers the monitor but keeps its caption style, so it doesn't count. Chromium browsers
// (Brave, Chrome, Edge) stay "maximized" in video full screen, so IsZoomed can't be used; they drop the caption instead. Gabay's own window never changes the answer (clicking the panel over a game keeps it "full screen").
const SOURCE = String.raw`
using System;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;

static class Watcher {
  [StructLayout(LayoutKind.Sequential)] struct RECT { public int L, T, R, B; }
  [StructLayout(LayoutKind.Sequential)] struct MONITORINFO { public int cbSize; public RECT rcMonitor; public RECT rcWork; public uint dwFlags; }
  [DllImport("user32.dll")] static extern bool SetProcessDPIAware();
  [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] static extern IntPtr GetShellWindow();
  [DllImport("user32.dll")] static extern IntPtr GetDesktopWindow();
  [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] static extern int GetWindowLong(IntPtr h, int i);
  const int GWL_STYLE = -16, WS_CAPTION = 0x00C00000;
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] static extern IntPtr MonitorFromWindow(IntPtr h, uint flags);
  [DllImport("user32.dll")] static extern bool GetMonitorInfo(IntPtr m, ref MONITORINFO mi);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetClassName(IntPtr h, StringBuilder s, int n);

  static void Main(string[] args) {
    SetProcessDPIAware(); // physical pixels; Electron converts back with screenToDipRect
    uint self = args.Length > 0 ? uint.Parse(args[0]) : 0;
    // Exit with the parent: Gabay holds our stdin, and it closes when Gabay goes away for any reason.
    new Thread(() => { try { Console.In.ReadToEnd(); } catch { } Environment.Exit(0); }) { IsBackground = true }.Start();
    string last = null;
    while (true) {
      string now = Check(self);
      if (now != null && now != last) { Console.Out.WriteLine(now); Console.Out.Flush(); last = now; }
      Thread.Sleep(400);
    }
  }

  // Returns null for "no new information" (Gabay itself is in front).
  static string Check(uint self) {
    IntPtr h = GetForegroundWindow();
    if (h == IntPtr.Zero || h == GetShellWindow() || h == GetDesktopWindow() || !IsWindowVisible(h)) return "fs 0";
    uint pid; GetWindowThreadProcessId(h, out pid);
    if (pid == self) return null;
    var cls = new StringBuilder(64); GetClassName(h, cls, 64);
    string c = cls.ToString();
    if (c == "Progman" || c == "WorkerW" || c == "Shell_TrayWnd") return "fs 0";
    if ((GetWindowLong(h, GWL_STYLE) & WS_CAPTION) == WS_CAPTION) return "fs 0";
    RECT r; if (!GetWindowRect(h, out r)) return "fs 0";
    var mi = new MONITORINFO(); mi.cbSize = Marshal.SizeOf(typeof(MONITORINFO));
    if (!GetMonitorInfo(MonitorFromWindow(h, 2), ref mi)) return "fs 0";
    var m = mi.rcMonitor;
    if (r.L <= m.L && r.T <= m.T && r.R >= m.R && r.B >= m.B) return "fs 1 " + m.L + " " + m.T + " " + m.R + " " + m.B;
    return "fs 0";
  }
}
`

const csc = (): string | null => {
  const win = process.env['WINDIR'] ?? 'C:\\Windows'
  for (const fw of ['Framework64', 'Framework']) {
    const p = join(win, 'Microsoft.NET', fw, 'v4.0.30319', 'csc.exe')
    if (existsSync(p)) return p
  }
  return null
}

/** Compile the watcher if this exact source isn't cached yet. Null when Windows has no C# compiler. */
async function watcherExe(): Promise<string | null> {
  const compiler = csc()
  if (!compiler) return null
  const hash = createHash('sha256').update(SOURCE).digest('hex').slice(0, 12)
  const dir = join(app.getPath('userData'), 'bin')
  const exe = join(dir, `fullscreen-watcher-${hash}.exe`)
  if (existsSync(exe)) return exe
  await mkdir(dir, { recursive: true })
  const src = join(dir, `fullscreen-watcher-${hash}.cs`)
  await writeFile(src, SOURCE, 'utf8')
  return new Promise((resolve) => {
    execFile(compiler, ['/nologo', '/optimize+', '/target:exe', `/out:${exe}`, src], { windowsHide: true, timeout: 60_000 }, (err) =>
      resolve(err || !existsSync(exe) ? null : exe)
    )
  })
}

let child: ChildProcess | null = null
let stopped = false

/**
 * Calls onChange(true) while a full-screen window covers the given display, onChange(false) otherwise.
 * Best effort: if the watcher can't be built or dies, nothing is reported and the notch simply stays visible.
 */
export async function startFullscreenWatch(displayBounds: () => Electron.Rectangle, onChange: (fs: boolean) => void): Promise<void> {
  const exe = await watcherExe()
  if (!exe || stopped) return
  const p = spawn(exe, [String(process.pid)], { windowsHide: true, stdio: ['pipe', 'pipe', 'ignore'] })
  child = p
  let buf = ''
  let current = false
  p.stdout?.setEncoding('utf8')
  p.stdout?.on('data', (chunk: string) => {
    buf += chunk
    let nl: number
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).trim()
      buf = buf.slice(nl + 1)
      let fs = false
      const m = /^fs 1 (-?\d+) (-?\d+) (-?\d+) (-?\d+)$/.exec(line)
      if (m) {
        const [l, t, r, b] = m.slice(1).map(Number)
        // Physical pixels -> DIP, then: is the full-screen monitor the one the notch is on?
        const dip = screen.screenToDipRect(null, { x: l, y: t, width: r - l, height: b - t })
        const d = displayBounds()
        const cx = dip.x + dip.width / 2
        const cy = dip.y + dip.height / 2
        fs = cx >= d.x && cx < d.x + d.width && cy >= d.y && cy < d.y + d.height
      }
      if (fs !== current) {
        current = fs
        onChange(fs)
      }
    }
  })
  p.on('exit', () => {
    if (child === p) child = null
    if (current) onChange(false) // never leave the notch hidden because the watcher went away
  })
}

export function stopFullscreenWatch(): void {
  stopped = true
  child?.stdin?.end()
  child?.kill()
  child = null
}
