//************************************************************************************************
// Copyright © 2026 Steven M Cohn. All rights reserved.
//************************************************************************************************

namespace River.OneMoreAddIn.Commands
{
	using Newtonsoft.Json.Linq;
	using River.OneMoreAddIn.Models;
	using River.OneMoreAddIn.Settings;
	using River.OneMoreAddIn.UI;
	using System.Drawing;
	using System.Globalization;
	using System.Linq;
	using System.Threading.Tasks;
	using System.Xml.Linq;


	/// <summary>
	/// An equation inserted by this command, found under OneNote's cursor
	/// </summary>
	internal sealed class SelectedEquation
	{
		/// <summary>The objectID of the paragraph (OE) holding the equation</summary>
		public string ObjectId { get; set; }

		/// <summary>The Mathematica source stored with the equation</summary>
		public string Source { get; set; }
	}


	internal enum EquationOutcome
	{
		Inserted,
		Replaced,
		NoAnchor,
		Empty
	}


	/// <summary>
	/// Opens the Mathematica-syntax equation editor as a side panel next to OneNote. The panel
	/// inserts equations at OneNote's cursor, either as native OneNote equations (MathML) or as
	/// rendered PNG images. If the cursor is on an equation previously inserted by the editor,
	/// that equation is loaded for editing and replaced in place.
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
			SelectedEquation selected = null;
			Rectangle bounds;

			await using (var one = new OneNote(out var page, out var ns))
			{
				bounds = one.GetCurrentMainWindowBounds();
				if (page is not null)
				{
					selected = ReadSelected(page, ns);
				}
			}

			var settings = new SettingsProvider().GetCollection(SettingsName);
			var init = new JObject
			{
				["source"] = string.Empty,
				["editing"] = false,
				["mode"] = settings.Get("mode", "native"),
				["size"] = settings.Get("size", 20),
				["dock"] = settings.Get("dock", "right"),
				["dockTop"] = settings.Get("dockTop", 150),
				["color"] = "#000000",
				["theme"] = ThemeManager.Instance.DarkMode ? "dark" : "light"
			};

			// returns immediately; the panel runs on its own thread
			EquationDialog.Present(init, selected, bounds);
		}


		/// <summary>
		/// Returns the editor equation under OneNote's cursor, or null
		/// </summary>
		public static SelectedEquation ReadSelected(Page page, XNamespace ns)
		{
			var anchor = FindAnchor(page, ns);
			var meta = anchor?.Elements(ns + "Meta")
				.FirstOrDefault(e => e.Attribute("name")?.Value == SourceMetaKey);

			if (meta is null)
			{
				return null;
			}

			return new SelectedEquation
			{
				ObjectId = anchor.Attribute("objectID")?.Value,
				Source = meta.Attribute("content")?.Value ?? string.Empty
			};
		}


		/// <summary>
		/// Inserts or replaces an equation on the given page; the caller saves the page.
		/// </summary>
		/// <param name="page">The current page, read with selection detail</param>
		/// <param name="ns">The page namespace</param>
		/// <param name="result">The equation to insert</param>
		/// <param name="editingId">
		/// objectID of the equation paragraph being edited, or null to insert a new one
		/// </param>
		public static EquationOutcome Apply(
			Page page, XNamespace ns, EquationResult result, string editingId)
		{
			var content = result.Mode == "image"
				? MakeImage(ns, result)
				: MakeEquation(ns, result);

			if (content is null)
			{
				return EquationOutcome.Empty;
			}

			var meta = new Meta(ns, SourceMetaKey, result.Source ?? string.Empty);

			if (!string.IsNullOrEmpty(editingId))
			{
				var target = page.Root.Descendants(ns + "OE")
					.FirstOrDefault(e => e.Attribute("objectID")?.Value == editingId);

				if (target is not null)
				{
					Fill(target, ns, meta, content);
					return EquationOutcome.Replaced;
				}
			}

			var anchor = FindAnchor(page, ns);
			if (anchor is null)
			{
				return EquationOutcome.NoAnchor;
			}

			// the equation always gets its own paragraph so the paragraph you type in keeps its
			// normal font; on an empty line it goes just above, leaving the line for typing
			if (IsEmptyParagraph(anchor, ns))
			{
				anchor.AddBeforeSelf(new XElement(ns + "OE", meta, content));
				return EquationOutcome.Inserted;
			}

			// otherwise after the cursor's paragraph and after any equations already inserted
			// there, so a series of equations stays in the order it was typed
			var after = anchor;
			while (after.NextNode is XElement next &&
				next.Name == ns + "OE" &&
				next.Elements(ns + "Meta").Any(m => m.Attribute("name")?.Value == SourceMetaKey))
			{
				after = next;
			}

			after.AddAfterSelf(new XElement(ns + "OE", meta, content));
			return EquationOutcome.Inserted;
		}


		/// <summary>
		/// Replaces the contents of a paragraph, keeping its objectID so OneNote updates it in
		/// place rather than adding a new paragraph
		/// </summary>
		private static void Fill(XElement oe, XNamespace ns, XElement meta, XElement content)
		{
			oe.Elements().Where(e => e.Name != ns + "OEChildren").Remove();
			oe.AddFirst(meta, content);
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
				oe.Elements(ns + "Meta").FirstOrDefault() is null &&
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
