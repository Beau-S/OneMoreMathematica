//************************************************************************************************
// Copyright © 2026 Steven M Cohn. All rights reserved.
//************************************************************************************************

namespace River.OneMoreAddIn.Commands
{
	using Newtonsoft.Json.Linq;
	using River.OneMoreAddIn.Models;
	using River.OneMoreAddIn.Settings;
	using River.OneMoreAddIn.UI;
	using System.Globalization;
	using System.Linq;
	using System.Threading.Tasks;
	using System.Windows.Forms;
	using System.Xml.Linq;


	/// <summary>
	/// Opens the Mathematica-syntax equation editor and inserts the result at the cursor,
	/// either as a native OneNote equation (MathML) or as a rendered PNG image. If the cursor
	/// is on an equation previously inserted by this command, that equation is opened for
	/// editing and replaced in place.
	/// </summary>
	internal class EquationCommand : Command
	{
		/// <summary>Meta key holding the Mathematica source on the equation's OE</summary>
		public const string SourceMetaKey = "omEquation";

		/// <summary>Settings collection name, shared with EquationSheet</summary>
		public const string SettingsName = "EquationSheet";


		public EquationCommand()
		{
		}


		public override async Task Execute(params object[] args)
		{
			await using var one = new OneNote(out var page, out var ns);
			PageNamespace.Set(ns);

			var anchor = FindAnchor(page, ns);
			if (anchor is null)
			{
				ShowError("Click into a paragraph in the page body, then run Insert Equation again.");
				return;
			}

			var existing = anchor.Elements(ns + "Meta")
				.FirstOrDefault(e => e.Attribute("name")?.Value == SourceMetaKey);

			var settings = new SettingsProvider().GetCollection(SettingsName);
			var init = new JObject
			{
				["source"] = existing?.Attribute("content")?.Value ?? string.Empty,
				["editing"] = existing is not null,
				["mode"] = settings.Get("mode", "native"),
				["size"] = settings.Get("size", 20),
				["color"] = "#000000",
				["theme"] = ThemeManager.Instance.DarkMode ? "dark" : "light"
			};

			var result = await SingleThreaded.Invoke(() =>
			{
				// WebView2 needs an STA thread with a message pump
				using (var dialog = new EquationDialog(init))
				{
					return dialog.ShowDialog(owner) == DialogResult.OK ? dialog.Result : null;
				}
			});

			if (result is null)
			{
				IsCancelled = true;
				return;
			}

			var content = result.Mode == "image"
				? MakeImage(ns, result)
				: MakeEquation(ns, result);

			if (content is null)
			{
				ShowError("The equation editor returned nothing to insert.");
				return;
			}

			var meta = new Meta(ns, SourceMetaKey, result.Source ?? string.Empty);

			if (existing is not null || IsEmptyParagraph(anchor, ns))
			{
				// replace the contents of this paragraph, keeping its objectID so OneNote
				// updates it in place rather than adding a new paragraph
				anchor.Elements().Where(e => e.Name != ns + "OEChildren").Remove();
				anchor.AddFirst(meta, content);
			}
			else
			{
				anchor.AddAfterSelf(new XElement(ns + "OE", meta, content));
			}

			await one.Update(page);
		}


		/// <summary>
		/// Finds the body paragraph holding the cursor or the selected image.
		/// </summary>
		private static XElement FindAnchor(Page page, XNamespace ns)
		{
			return page.Root.Descendants(ns + "OE")
				.LastOrDefault(e =>
					!e.Ancestors(ns + "Title").Any() &&
					e.Elements().Any(c =>
						(c.Name == ns + "T" || c.Name == ns + "Image") &&
						c.Attribute("selected")?.Value == "all"));
		}


		private static bool IsEmptyParagraph(XElement oe, XNamespace ns)
		{
			var runs = oe.Elements(ns + "T").ToList();
			return runs.Count > 0 &&
				oe.Elements(ns + "Image").FirstOrDefault() is null &&
				oe.Elements(ns + "Table").FirstOrDefault() is null &&
				runs.All(t => string.IsNullOrWhiteSpace(t.TextValue(true)));
		}


		private static XElement MakeEquation(XNamespace ns, EquationResult result)
		{
			if (string.IsNullOrWhiteSpace(result.MathML))
			{
				return null;
			}

			// OneNote stores an equation as MathML inside a conditional comment in the run;
			// a "--" sequence would terminate the comment early, so break any up
			var mathml = result.MathML.Replace("--", "-&#x2D;");

			return new XElement(ns + "T",
				new XCData($"<!--[if mathML]>{mathml}<![endif]-->"));
		}


		private static XElement MakeImage(XNamespace ns, EquationResult result)
		{
			if (string.IsNullOrWhiteSpace(result.Png) || result.Width <= 0 || result.Height <= 0)
			{
				return null;
			}

			// editor reports CSS pixels; OneNote sizes are in points (96 px = 72 pt)
			var width = (result.Width * 0.75).ToString("0.0", CultureInfo.InvariantCulture);
			var height = (result.Height * 0.75).ToString("0.0", CultureInfo.InvariantCulture);

			var alt = $"Mathematica: {result.Source}\nLaTeX: {result.Tex}";

			return new XElement(ns + "Image",
				new XAttribute("alt", alt),
				new XElement(ns + "Size",
					new XAttribute("width", width),
					new XAttribute("height", height),
					new XAttribute("isSetByUser", "true")),
				new XElement(ns + "Data", result.Png));
		}
	}
}
