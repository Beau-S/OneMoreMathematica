//************************************************************************************************
// Copyright © 2026 Steven M Cohn. All rights reserved.
//************************************************************************************************

namespace River.OneMoreAddIn.Commands
{
	using Microsoft.Web.WebView2.Core;
	using Microsoft.Web.WebView2.WinForms;
	using Newtonsoft.Json;
	using Newtonsoft.Json.Linq;
	using River.OneMoreAddIn.UI;
	using System;
	using System.Drawing;
	using System.IO;
	using System.Reflection;
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
	/// Hosts the Mathematica equation editor (Commands/Equations/Web) in a WebView2.
	/// The page posts a JSON message with action "insert" or "cancel".
	/// </summary>
	internal class EquationDialog : MoreForm
	{
		private const string HostName = "equation.onemore.local";

		private readonly WebView2 webView;
		private readonly string initJson;


		public EquationDialog(JObject init)
		{
			initJson = init.ToString(Formatting.None);

			Text = "Equation";
			Size = new Size(980, 640);
			MinimumSize = new Size(560, 420);
			StartPosition = FormStartPosition.CenterParent;
			MinimizeBox = false;
			MaximizeBox = true;
			ShowInTaskbar = false;
			ShowIcon = false;
			KeyPreview = true;

			// the add-in runs in a COM surrogate process, which Windows won't let take the
			// foreground from OneNote; TopMost keeps the editor from opening behind OneNote
			TopMost = true;

			webView = new WebView2
			{
				Dock = DockStyle.Fill,
				DefaultBackgroundColor = init.Value<string>("theme") == "dark"
					? Color.FromArgb(31, 31, 31)
					: Color.FromArgb(247, 248, 250)
			};

			Controls.Add(webView);
		}


		/// <summary>
		/// Gets the equation to insert, or null if the user cancelled
		/// </summary>
		public EquationResult Result { get; private set; }


		protected override async void OnLoad(EventArgs e)
		{
			base.OnLoad(e);

			// OneMore's global hotkeys must not swallow keys typed into the editor
			HotkeyManager.Suspend();

			try
			{
				var folder = EnsureAssets();

				var env = await CoreWebView2Environment.CreateAsync(null,
					Path.Combine(PathHelper.GetAppDataPath(), Resx.ProgramName));

				await webView.EnsureCoreWebView2Async(env);

				var core = webView.CoreWebView2;
				core.Settings.AreDevToolsEnabled = false;
				core.Settings.IsStatusBarEnabled = false;
				core.Settings.AreBrowserAcceleratorKeysEnabled = false;

				core.SetVirtualHostNameToFolderMapping(
					HostName, folder, CoreWebView2HostResourceAccessKind.Allow);

				core.WebMessageReceived += ReceiveMessage;

				await core.AddScriptToExecuteOnDocumentCreatedAsync(
					$"window.__eqInit = {initJson};");

				core.Navigate($"https://{HostName}/equation.html");
			}
			catch (Exception exc)
			{
				logger.WriteLine("error starting equation editor", exc);
				MessageBox.Show(this,
					"The equation editor could not start. The Microsoft Edge WebView2 Runtime " +
					"may be missing.\n\n" + exc.Message,
					Resx.ProgramName, MessageBoxButtons.OK, MessageBoxIcon.Error);

				DialogResult = DialogResult.Cancel;
				Close();
			}
		}


		protected override void OnShown(EventArgs e)
		{
			base.OnShown(e);
			Activate();
			webView.Focus();
		}


		protected override void OnFormClosed(FormClosedEventArgs e)
		{
			HotkeyManager.Resume();
			base.OnFormClosed(e);
		}


		private void ReceiveMessage(object sender, CoreWebView2WebMessageReceivedEventArgs e)
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

			var action = message.Value<string>("action");
			if (action == "insert")
			{
				Result = new EquationResult
				{
					Mode = message.Value<string>("mode"),
					Source = message.Value<string>("source"),
					Tex = message.Value<string>("tex"),
					MathML = message.Value<string>("mathml"),
					Png = message.Value<string>("png"),
					Width = message.Value<double?>("width") ?? 0,
					Height = message.Value<double?>("height") ?? 0
				};

				DialogResult = DialogResult.OK;
				Close();
			}
			else if (action == "cancel")
			{
				DialogResult = DialogResult.Cancel;
				Close();
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
