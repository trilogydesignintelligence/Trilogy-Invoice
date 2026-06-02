-- PMM Construct — Packet Assembler (drag-and-drop droplet)
-- Part of the PMM Tools Suite (Trilogy Design Intelligence)
--
-- This is an AppleScript "droplet." Once saved as an app (see
-- MAC_APP_SETUP.txt), your team drags a draw folder onto its icon
-- and PACKET.pdf is built inside that folder — no Terminal, no typing.
--
-- It also works if double-clicked: it will ask you to choose the
-- draw folder.
--
-- IMPORTANT: set SCRIPT_PATH below to the full path of
-- assemble_packet.py on this Mac (the setup guide explains how).

-- ====== EDIT THIS ONE LINE ======
-- Full path to assemble_packet.py on this Mac.
-- Example: "/Users/christiana/PMMConstruct/assemble_packet.py"
property SCRIPT_PATH : "/REPLACE/WITH/PATH/TO/assemble_packet.py"
-- =================================

-- Run the assembler on one folder, capturing output for display.
on assembleFolder(folderPath)
	set pyCmd to "python3 " & quoted form of SCRIPT_PATH & " " & quoted form of folderPath
	try
		set theResult to do shell script pyCmd
		return {success:true, output:theResult}
	on error errMsg number errNum
		return {success:false, output:errMsg}
	end try
end assembleFolder

-- Verify Python and the script are present; give a friendly message if not.
on preflight()
	-- Is the script path still the placeholder?
	if SCRIPT_PATH contains "/REPLACE/WITH/PATH/" then
		display dialog "This app hasn't been set up yet." & return & return & ¬
			"Open it in Script Editor and set SCRIPT_PATH to the full " & ¬
			"path of assemble_packet.py, then re-save. See MAC_APP_SETUP.txt." ¬
			buttons {"OK"} default button "OK" with icon stop
		return false
	end if
	-- Does the script file exist?
	try
		do shell script "test -f " & quoted form of SCRIPT_PATH
	on error
		display dialog "Can't find the assembler script at:" & return & return & ¬
			SCRIPT_PATH & return & return & ¬
			"Open this app in Script Editor and fix the SCRIPT_PATH line." ¬
			buttons {"OK"} default button "OK" with icon stop
		return false
	end try
	-- Is python3 available?
	try
		do shell script "which python3"
	on error
		display dialog "Python 3 isn't installed on this Mac yet." & return & return & ¬
			"See MAC_APP_SETUP.txt — it has a 2-minute install step." ¬
			buttons {"OK"} default button "OK" with icon stop
		return false
	end try
	return true
end preflight

-- Shared handler for one folder.
on processOneFolder(folderPath)
	set res to assembleFolder(folderPath)
	if success of res then
		display dialog "Packet built." & return & return & ¬
			(output of res) & return & return & ¬
			"You'll find PACKET.pdf inside the folder." ¬
			buttons {"Open Folder", "Done"} default button "Done" with icon note
		if button returned of result is "Open Folder" then
			do shell script "open " & quoted form of folderPath
		end if
	else
		display dialog "Something went wrong:" & return & return & ¬
			(output of res) & return & return & ¬
			"Check that the folder has your invoice (00_invoice.pdf) and " & ¬
			"the sub-invoice PDFs (01_..., 02_...) inside it." ¬
			buttons {"OK"} default button "OK" with icon caution
	end if
end processOneFolder

-- When a folder is DROPPED on the app icon.
on open droppedItems
	if not preflight() then return
	repeat with anItem in droppedItems
		set itemPath to POSIX path of anItem
		-- Only act on folders; ignore stray dropped files.
		try
			set isFolder to (do shell script "test -d " & quoted form of itemPath & " && echo yes || echo no")
		on error
			set isFolder to "no"
		end try
		if isFolder is "yes" then
			processOneFolder(itemPath)
		else
			display dialog "Please drop the FOLDER for the draw, not an " & ¬
				"individual file." buttons {"OK"} default button "OK" with icon caution
		end if
	end repeat
end open

-- When the app is DOUBLE-CLICKED (no folder dropped): ask for one.
on run
	if not preflight() then return
	set chosen to choose folder with prompt "Choose the draw folder (with your invoice and sub-invoice PDFs):"
	processOneFolder(POSIX path of chosen)
end run
