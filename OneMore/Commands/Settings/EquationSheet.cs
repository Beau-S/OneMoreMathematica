//************************************************************************************************
// Copyright © 2026 Steven M Cohn. All rights reserved.
//************************************************************************************************

namespace River.OneMoreAddIn.Settings
{
	using River.OneMoreAddIn.Commands;
	using System.Drawing;
	using System.Windows.Forms;
	using Resx = Properties.Resources;


	/// <summary>
	/// Settings for the Insert Equation command. Built in code; there is no designer file.
	/// </summary>
	internal class EquationSheet : SheetBase
	{
		private readonly ComboBox modeBox;
		private readonly NumericUpDown sizeBox;
		private readonly ComboBox dockBox;
		private static readonly string[] DockValues = { "right", "left", "float" };


		public EquationSheet(SettingsProvider provider) : base(provider)
		{
			Name = EquationCommand.SettingsName;
			Title = Resx.EquationSheet_Title;

			var settings = provider.GetCollection(Name);

			var intro = new Label
			{
				Text = "Insert Equation takes Mathematica syntax and inserts it at the cursor. " +
					"Choose what the editor's default button inserts; the other choice stays " +
					"available in the editor (Ctrl+Shift+Enter).",
				AutoSize = false,
				Location = new Point(10, 10),
				Size = new Size(760, 60)
			};

			var modeLabel = new Label
			{
				Text = "Default insert:",
				AutoSize = true,
				Location = new Point(10, 88)
			};

			modeBox = new ComboBox
			{
				DropDownStyle = ComboBoxStyle.DropDownList,
				Location = new Point(220, 84),
				Width = 360
			};
			modeBox.Items.Add("Native OneNote equation (editable)");
			modeBox.Items.Add("Image (rendered LaTeX)");
			modeBox.SelectedIndex = settings.Get("mode", "native") == "image" ? 1 : 0;

			var sizeLabel = new Label
			{
				Text = "Image font size (px):",
				AutoSize = true,
				Location = new Point(10, 132)
			};

			sizeBox = new NumericUpDown
			{
				Minimum = 12,
				Maximum = 40,
				Location = new Point(220, 128),
				Width = 100
			};
			var size = settings.Get("size", 20);
			sizeBox.Value = size < 12 ? 12 : (size > 40 ? 40 : size);

			var dockLabel = new Label
			{
				Text = "Editor panel:",
				AutoSize = true,
				Location = new Point(10, 176)
			};

			dockBox = new ComboBox
			{
				DropDownStyle = ComboBoxStyle.DropDownList,
				Location = new Point(220, 172),
				Width = 360
			};
			dockBox.Items.Add("Docked to the right of OneNote");
			dockBox.Items.Add("Docked to the left of OneNote");
			dockBox.Items.Add("Floating");
			dockBox.SelectedIndex = System.Math.Max(0, System.Array.IndexOf(DockValues, settings.Get("dock", "right")));

			var dockHint = new Label
			{
				Text = "Drag the panel to an edge of the OneNote window to dock it, or away to float it.",
				AutoSize = false,
				Location = new Point(220, 206),
				Size = new Size(560, 40)
			};

			Controls.Add(intro);
			Controls.Add(dockLabel);
			Controls.Add(dockBox);
			Controls.Add(dockHint);
			Controls.Add(modeLabel);
			Controls.Add(modeBox);
			Controls.Add(sizeLabel);
			Controls.Add(sizeBox);
		}


		public override bool CollectSettings()
		{
			var settings = provider.GetCollection(Name);

			var save = settings.Add("mode", modeBox.SelectedIndex == 1 ? "image" : "native");
			save = settings.Add("size", (int)sizeBox.Value) || save;
			save = settings.Add("dock", DockValues[System.Math.Max(0, dockBox.SelectedIndex)]) || save;

			if (save)
			{
				provider.SetCollection(settings);
			}

			// does not require a restart
			return false;
		}
	}
}
