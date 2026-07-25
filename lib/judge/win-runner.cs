// DSOJ Windows judge runner — LemonLime-compatible timing & memory.
// Build: csc /nologo /optimize+ /out:win-runner.exe win-runner.cs
//
// Metrics (same semantics as Project_LemonLime processrunner_win.cpp):
//   time  = user + kernel CPU ms via GetProcessTimes
//   memory = PeakWorkingSetSize via GetProcessMemoryInfo (reported value)
//   MLE soft-check uses max(PrivateUsage, PeakWorkingSetSize)
//
// Args:
//   --exe PATH --cwd DIR --in FILE --out FILE --err FILE --mem FILE --time FILE
//   [--args JSON_ARRAY] [--memory-limit-mb N]

using System;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Collections.Generic;

internal static class Native
{
    [StructLayout(LayoutKind.Sequential)]
    internal struct PROCESS_MEMORY_COUNTERS_EX
    {
        public uint cb;
        public uint PageFaultCount;
        public UIntPtr PeakWorkingSetSize;
        public UIntPtr WorkingSetSize;
        public UIntPtr QuotaPeakPagedPoolUsage;
        public UIntPtr QuotaPagedPoolUsage;
        public UIntPtr QuotaPeakNonPagedPoolUsage;
        public UIntPtr QuotaNonPagedPoolUsage;
        public UIntPtr PagefileUsage;
        public UIntPtr PeakPagefileUsage;
        public UIntPtr PrivateUsage;
    }

    [DllImport("psapi.dll", SetLastError = true)]
    internal static extern bool GetProcessMemoryInfo(
        IntPtr hProcess,
        out PROCESS_MEMORY_COUNTERS_EX counters,
        uint size);

    [DllImport("kernel32.dll", SetLastError = true)]
    internal static extern bool GetProcessTimes(
        IntPtr hProcess,
        out long creationTime,
        out long exitTime,
        out long kernelTime,
        out long userTime);

    internal static void ReadMemory(IntPtr handle, out long peakWs, out long privateBytes)
    {
        peakWs = 0;
        privateBytes = 0;
        var pmc = new PROCESS_MEMORY_COUNTERS_EX();
        pmc.cb = (uint)Marshal.SizeOf(typeof(PROCESS_MEMORY_COUNTERS_EX));
        if (!GetProcessMemoryInfo(handle, out pmc, pmc.cb)) return;
        peakWs = (long)pmc.PeakWorkingSetSize.ToUInt64();
        privateBytes = (long)pmc.PrivateUsage.ToUInt64();
    }

    // FILETIME is 100-ns ticks
    internal static int CpuTimeMs(IntPtr handle)
    {
        long creation, exit, kernel, user;
        if (!GetProcessTimes(handle, out creation, out exit, out kernel, out user)) return 0;
        double ms = (kernel + user) / 10000.0;
        if (ms < 0) return 0;
        int rounded = (int)Math.Round(ms);
        return rounded < 1 && (kernel + user) > 0 ? 1 : rounded;
    }
}

internal static class Program
{
    static int Main(string[] rawArgs)
    {
        string exe = null, cwd = null, inFile = null, outFile = null, errFile = null;
        string memFile = null, timeFile = null, argsJson = "[]";
        int memoryLimitMb = 0;

        for (int i = 0; i < rawArgs.Length; i++)
        {
            string a = rawArgs[i];
            string next = (i + 1 < rawArgs.Length) ? rawArgs[i + 1] : null;
            if (a == "--exe" && next != null) { exe = next; i++; }
            else if (a == "--cwd" && next != null) { cwd = next; i++; }
            else if (a == "--in" && next != null) { inFile = next; i++; }
            else if (a == "--out" && next != null) { outFile = next; i++; }
            else if (a == "--err" && next != null) { errFile = next; i++; }
            else if (a == "--mem" && next != null) { memFile = next; i++; }
            else if (a == "--time" && next != null) { timeFile = next; i++; }
            else if (a == "--args" && next != null) { argsJson = next; i++; }
            else if (a == "--memory-limit-mb" && next != null)
            {
                int.TryParse(next, out memoryLimitMb);
                i++;
            }
        }

        if (string.IsNullOrEmpty(exe) || string.IsNullOrEmpty(cwd) ||
            string.IsNullOrEmpty(inFile) || string.IsNullOrEmpty(outFile) ||
            string.IsNullOrEmpty(errFile) || string.IsNullOrEmpty(memFile) ||
            string.IsNullOrEmpty(timeFile))
        {
            Console.Error.WriteLine("usage: win-runner --exe PATH --cwd DIR --in F --out F --err F --mem F --time F [--args JSON] [--memory-limit-mb N]");
            return 2;
        }

        try
        {
            if (!File.Exists(inFile)) File.WriteAllText(inFile, "", new UTF8Encoding(false));

            var argList = new List<string>();
            if (!string.IsNullOrEmpty(argsJson) && argsJson != "[]")
            {
                // Minimal JSON string-array parse without System.Web dependency
                argList.AddRange(ParseJsonStringArray(argsJson));
            }

            var psi = new ProcessStartInfo();
            psi.FileName = exe;
            psi.WorkingDirectory = cwd;
            psi.UseShellExecute = false;
            psi.RedirectStandardInput = true;
            psi.RedirectStandardOutput = true;
            psi.RedirectStandardError = true;
            psi.CreateNoWindow = true;
            if (argList.Count > 0)
            {
                var sb = new StringBuilder();
                for (int i = 0; i < argList.Count; i++)
                {
                    if (i > 0) sb.Append(' ');
                    sb.Append(QuoteArg(argList[i]));
                }
                psi.Arguments = sb.ToString();
            }

            var p = new Process();
            p.StartInfo = psi;
            if (!p.Start())
            {
                WriteText(errFile, "failed to start process");
                WriteText(memFile, "0");
                WriteText(timeFile, "0");
                return 1;
            }

            var stdoutTask = p.StandardOutput.ReadToEndAsync();
            var stderrTask = p.StandardError.ReadToEndAsync();
            string inputText = File.ReadAllText(inFile);
            p.StandardInput.Write(inputText ?? "");
            p.StandardInput.Close();

            long peakWs = 0;
            long peakForLimit = 0;
            long memLimitBytes = memoryLimitMb > 0 ? (long)memoryLimitMb * 1024L * 1024L : 0;

            // Child-only wall clock (Stopwatch). Never include runner startup.
            // Prefer GetProcessTimes CPU; if 0 (common for tiny programs), use child wall.
            var wallSw = Stopwatch.StartNew();
            Sample(p, ref peakWs, ref peakForLimit);
            while (!p.HasExited)
            {
                Sample(p, ref peakWs, ref peakForLimit);
                if (memLimitBytes > 0 && peakForLimit > memLimitBytes)
                {
                    try { p.Kill(); } catch { }
                    break;
                }
                Thread.Sleep(5);
            }
            wallSw.Stop();

            // After exit, handle still valid — LemonLime reads PeakWorkingSet here.
            Sample(p, ref peakWs, ref peakForLimit);

            string stdout = stdoutTask.Result ?? "";
            string stderr = stderrTask.Result ?? "";
            WriteText(outFile, stdout);
            WriteText(errFile, stderr);

            int cpuMs = Native.CpuTimeMs(p.Handle);
            int childWallMs = (int)wallSw.ElapsedMilliseconds;
            int reportMs = cpuMs > 0 ? cpuMs : childWallMs;
            if (reportMs < 1) reportMs = 1;

            long peakKb = peakWs / 1024;
            if (peakKb < 0) peakKb = 0;
            WriteText(memFile, peakKb.ToString());
            WriteText(timeFile, reportMs.ToString());

            int code = 0;
            try { code = p.ExitCode; } catch { code = 1; }
            try { p.Dispose(); } catch { }
            return code;
        }
        catch (Exception ex)
        {
            try { WriteText(errFile, ex.Message); } catch { }
            try { WriteText(memFile, "0"); } catch { }
            try { WriteText(timeFile, "0"); } catch { }
            return 1;
        }
    }

    static void Sample(Process p, ref long peakWs, ref long peakForLimit)
    {
        try
        {
            long ws, priv;
            Native.ReadMemory(p.Handle, out ws, out priv);
            if (ws > peakWs) peakWs = ws;
            long lim = ws > priv ? ws : priv;
            if (lim > peakForLimit) peakForLimit = lim;
        }
        catch { }
    }

    static void WriteText(string path, string content)
    {
        File.WriteAllText(path, content ?? "", new UTF8Encoding(false));
    }

    static string QuoteArg(string s)
    {
        if (string.IsNullOrEmpty(s)) return "\"\"";
        if (s.IndexOfAny(new[] { ' ', '\t', '"' }) < 0) return s;
        return "\"" + s.Replace("\"", "\\\"") + "\"";
    }

    // Parses a JSON array of strings: ["a","b"] — no external deps.
    static List<string> ParseJsonStringArray(string json)
    {
        var result = new List<string>();
        if (string.IsNullOrEmpty(json)) return result;
        json = json.Trim();
        if (json.Length < 2 || json[0] != '[') return result;
        int i = 1;
        while (i < json.Length)
        {
            while (i < json.Length && (json[i] == ' ' || json[i] == ',' || json[i] == '\n' || json[i] == '\r' || json[i] == '\t')) i++;
            if (i >= json.Length || json[i] == ']') break;
            if (json[i] != '"') break;
            i++;
            var sb = new StringBuilder();
            while (i < json.Length)
            {
                char c = json[i++];
                if (c == '\\' && i < json.Length)
                {
                    char n = json[i++];
                    if (n == '"' || n == '\\' || n == '/') sb.Append(n);
                    else if (n == 'n') sb.Append('\n');
                    else if (n == 't') sb.Append('\t');
                    else sb.Append(n);
                }
                else if (c == '"') break;
                else sb.Append(c);
            }
            result.Add(sb.ToString());
        }
        return result;
    }
}
