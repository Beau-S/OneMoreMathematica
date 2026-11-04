//************************************************************************************************
// Copyright © 2026 Steven M Cohn. All rights reserved.
//************************************************************************************************

namespace River.OneMoreAddIn.Commands
{
	using Microsoft.Web.WebView2.Core;
	using Microsoft.Web.WebView2.WinForms;
	using Newtonsoft.Json;
	using Newtonsoft.Json.Linq;
	using River.OneMoreAddIn.Models;
	using River.OneMoreAddIn.UI;
	using System;
	using System.Diagnostics;
	using System.Drawing;
	using System.IO;
	using System.Reflection;
	using System.Threading;
	using System.Windows.Forms;
	using Resx = Properties.Resources;


	/// <summary>
	/// The equation produced by the editor
	/// </summary>
	internal sealed class EquationResult
	{
		/// <summary>"native" for a OneNote equation (MathML), "image" for a PNG</summary>
		public string Mode { get; set; }

		/// <summary>The Mathematica source as typed by the user</summary>
		public string Source { get; set; }

		/// <summary>The LaTeX rendering of Source</summary>
		public string Tex { get; set; }

		/// <summary>OneNote-ready MathML (mml: prefixed); Mode == native</summary>
		public string MathML { get; set; }

		/// <summary>Base64 PNG; Mode == image</summary>
		public string Png { get; set; }

		/// <summary>Display width of the PNG in CSS pixels</summary>
		public double Width { get; set; }

		/// <summary>Display height of the PNG in CSS pixels</summary>
		public double Height { get; set; }
	}


	/// <summary>
	/// A modeless side panel hosting the Mathematica equation editor (Commands/Equations/Web)
	/// in a WebView2. It runs on its own STA thread so OneNote stays fully usable while it is
	/// open; each Insert reads the page at that moment and inserts at OneNote's cursor.
	/// </summary>
	internal class EquationDialog : MoreForm
	{
		private const string HostName = "equation.onemore.local";
		private const int PanelWidth = 470;

		private static readonly object Gate = new();
		private static EquationDialog current;
		private static bool opening;

		private readonly WebView2 webView;
		private readonly System.Windows.Forms.Timer topTimer;
		private readonly string initJson;
		private readonly uint ownPid;
		private uint oneNotePid;
		private bool ready;
		private bool busy;

		// objectID of the paragraph holding the equation being edited, or null for new
		private string editingId;


		private EquationDialog(JObject init, string editingId)
		{
			initJson = init.ToString(Formatting.None);
			this.editingId = editingId;

			Text = "Equation";
			MinimumSize = new Size(360, 380);
			FormBorderStyle = FormBorderStyle.SizableToolWindow;
			ShowInTaskbar = false;
			ShowIcon = false;
			RememberSize = true;

			ownPid = (uint)Process.GetCurrentProcess().Id;

			webView = new WebView2
			{
				Dock = DockStyle.Fill,
				DefaultBackgroundColor = init.Value<string>("theme") == "dark"
					? Color.FromArgb(31, 31, 31)
					: Color.FromArgb(247, 248, 250)
			};

			Controls.Add(webView);

			// keep the panel above OneNote while OneNote (or this panel) is in front, but let
			// it sink behind other applications
			topTimer = new System.Windows.Forms.Timer { Interval = 300 };
			topTimer.Tick += TrackOneNote;
		}


		/// <summary>
		/// Opens the panel, or brings the open panel forward and loads the given equation.
		/// </summary>
		/// <param name="init">Editor startup options</param>
		/// <param name="selected">The equation under OneNote's cursor, if any</param>
		/// <param name="bounds">The OneNote main window bounds</param>
		public static void Present(JObject init, SelectedEquation selected, Rectangle bounds)
		{
			lock (Gate)
			{
				if (current is not null && !current.IsDisposed)
				{
					var panel = current;
					panel.BeginInvoke(new Action(() => panel.Bring(selected)));
					return;
				}

				if (opening)
				{
					return;
				}

				opening = true;
			}

			if (selected is not null)
			{
				init["source"] = selected.Source;
				init["editing"] = true;
			}

			var thread = new Thread(() =>
			{
				EquationDialog panel = null;
				try
				{
					panel = new EquationDialog(init, selected?.ObjectId);
					panel.FormClosed += (s, e) =>
					{
						lock (Gate)
						{
							if (current == panel) current = null;
						}
					};

					lock (Gate)
					{
						current = panel;
						opening = false;
					}

					panel.Height = Math.Max(panel.MinimumSize.Height, Math.Min(760, bounds.Height - 160));
					panel.Width = PanelWidth;

					var location = new Point(
						Math.Max(bounds.Left, bounds.Right - panel.Width - 28),
						bounds.Top + 130);

					// blocks this thread's message loop until the panel closes
					panel.RunModeless(location);
				}
				catch (Exception exc)
				{
					Logger.Current.WriteLine("error running equation panel", exc);
				}
				finally
				{
					lock (Gate)
					{
						opening = false;
						if (current == panel) current = null;
					}
				}
			})
			{
				IsBackground = true,
				Name = "EquationPanel"
			};

			thread.SetApartmentState(ApartmentState.STA);
			thread.Start();
		}


		protected override async void OnLoad(EventArgs e)
		{
			base.OnLoad(e);

			try
			{
				using (var one = new OneNote())
				{
					Native.GetWindowThreadProcessId(one.WindowHandle, out oneNotePid);
				}

				var folder = EnsureAssets();

				var env = await CoreWebView2Environment.CreateAsync(null,
					Path.Combine(PathHelper.GetAppDataPath(), Resx.ProgramName));

				await webView.EnsureCoreWebView2Async(env);

				var core = webView.CoreWebView2;
				core.Settings.AreDevToolsEnabled = false;
				core.Settings.IsStatusBarEnabled = false;
				core.Settings.IsZoomControlEnabled = false;
				core.Settings.AreBrowserAcceleratorKeysEnabled = false;

				core.SetVirtualHostNameToFolderMapping(
					HostName, folder, CoreWebView2HostResourceAccessKind.Allow);

				core.WebMessageReceived += ReceiveMessage;
				core.NavigationCompleted += (s, a) => ready = a.IsSuccess;

				await core.AddScriptToExecuteOnDocumentCreatedAsync(
					$"window.__eqInit = {initJson};");

				core.Navigate($"https://{HostName}/equation.html");
				topTimer.Start();
			}
			catch (Exception exc)
			{
				logger.WriteLine("error starting equation editor", exc);
				MessageBox.Show(this,
					"The equation editor could not start. The Microsoft Edge WebView2 Runtime " +
					"may be missing.\n\n" + exc.Message,
					Resx.ProgramName, MessageBoxButtons.OK, MessageBoxIcon.Error);

				Close();
			}
		}


		protected override void OnShown(EventArgs e)
		{
			base.OnShown(e);
			TopMost = true;
			Elevate();
			webView.Focus();
		}


		protected override void OnFormClosed(FormClosedEventArgs e)
		{
			topTimer.Stop();
			topTimer.Dispose();
			base.OnFormClosed(e);
		}


		private void Bring(SelectedEquation selected)
		{
			if (IsDisposed)
			{
				return;
			}

			if (selected is not null)
			{
				Load(selected);
			}

			if (WindowState == FormWindowState.Minimized)
			{
				WindowState = FormWindowState.Normal;
			}

			TopMost = true;
			Elevate();
			webView.Focus();
			Post(new JObject { ["action"] = "focus" });
		}


		private void Load(SelectedEquation selected)
		{
			editingId = selected.ObjectId;
			Post(new JObject
			{
				["action"] = "loaded",
				["source"] = selected.Source
			});
		}


		private void TrackOneNote(object sender, EventArgs e)
		{
			var foreground = Native.GetForegroundWindow();
			if (foreground == IntPtr.Zero)
			{
				return;
			}

			Native.GetWindowThreadProcessId(foreground, out var pid);
			var keep = pid == ownPid || (oneNotePid != 0 && pid == oneNotePid);
			if (TopMost != keep)
			{
				TopMost = keep;
			}
		}


		private void Post(JObject message)
		{
			if (ready && webView.CoreWebView2 is not null)
			{
				webView.CoreWebView2.PostWebMessageAsString(message.ToString(Formatting.None));
			}
		}


		private void PostError(string message)
		{
			Post(new JObject { ["action"] = "error", ["message"] = message });
		}


		private async void ReceiveMessage(object sender, CoreWebView2WebMessageReceivedEventArgs e)
		{
			JObject message;
			try
			{
				message = JObject.Parse(e.TryGetWebMessageAsString());
			}
			catch (Exception exc)
			{
				logger.WriteLine("bad message from equation editor", exc);
				return;
			}

			switch (message.Value<string>("action"))
			{
				case "insert":
					await Insert(message);
					break;

				case "load":
					await LoadSelected();
					break;

				case "new":
					editingId = null;
					break;

				case "close":
					Close();
					break;
			}
		}


		private async System.Threading.Tasks.Task Insert(JObject message)
		{
			if (busy)
			{
				return;
			}

			busy = true;
			try
			{
				var result = new EquationResult
				{
					Mode = message.Value<string>("mode"),
					Source = message.Value<string>("source"),
					Tex = message.Value<string>("tex"),
					MathML = message.Value<string>("mathml"),
					Png = message.Value<string>("png"),
					Width = message.Value<double?>("width") ?? 0,
					Height = message.Value<double?>("height") ?? 0
				};

				await using var one = new OneNote(out var page, out var ns);
				if (page is null)
				{
					PostError("Open a OneNote page first.");
					return;
				}

				PageNamespace.Set(ns);

				var outcome = EquationCommand.Apply(page, ns, result, editingId);
				switch (outcome)
				{
					case EquationOutcome.NoAnchor:
						PostError("Click into a paragraph on the page, then insert again.");
						return;

					case EquationOutcome.Empty:
						PostError("Nothing to insert.");
						return;
				}

				await one.Update(page);

				if (outcome != EquationOutcome.Replaced)
				{
					editingId = null;
				}

				Post(new JObject
				{
					["action"] = "inserted",
					["replaced"] = outcome == EquationOutcome.Replaced
				});
			}
			catch (Exception exc)
			{
				logger.WriteLine("error inserting equation", exc);
				PostError("Insert failed: " + exc.Message);
			}
			finally
			{
				busy = false;
			}
		}


		private async System.Threading.Tasks.Task LoadSelected()
		{
			try
			{
				await using var one = new OneNote(out var page, out var ns);
				var selected = page is null ? null : EquationCommand.ReadSelected(page, ns);
				if (selected is null)
				{
					PostError("Put OneNote's cursor on an equation inserted by this editor, then try again.");
					return;
				}

				Load(selected);
			}
			catch (Exception exc)
			{
				logger.WriteLine("error reading selected equation", exc);
				PostError("Could not read the page: " + exc.Message);
			}
		}


		/// <summary>
		/// Extracts the embedded web assets (page, converter, MathJax) to a local folder,
		/// refreshing them whenever this assembly changes.
		/// </summary>
		/// <returns>The path of the folder holding the assets</returns>
		private static string EnsureAssets()
		{
			var folder = Path.Combine(PathHelper.GetAppDataPath(), "Equation");
			Directory.CreateDirectory(folder);

			var assembly = Assembly.GetExecutingAssembly();
			var stamp = assembly.ManifestModule.ModuleVersionId.ToString("N");
			var stampPath = Path.Combine(folder, ".stamp");

			if (File.Exists(stampPath) && File.ReadAllText(stampPath) == stamp)
			{
				return folder;
			}

			const string prefix = "River.OneMoreAddIn.Equations.";
			foreach (var name in assembly.GetManifestResourceNames())
			{
				if (name.StartsWith(prefix, StringComparison.Ordinal))
				{
					using (var stream = assembly.GetManifestResourceStream(name))
					using (var file = File.Create(Path.Combine(folder, name.Substring(prefix.Length))))
					{
						stream.CopyTo(file);
					}
				}
			}

			File.WriteAllText(stampPath, stamp);
			return folder;
		}
	}
}
