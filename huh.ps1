# Capture the time the script starts
$startTime = Get-Date -Format "hh:mm tt"
$staticMessage = "Break started at $startTime ... "

# Array of ridiculous activities
$ridiculousMessages = @(
    "climbing mt everest in sandals",
    "running for world president",
    "tuckering out your mother",
    "wrestling a bear for my lunch money",
    "teaching my dog how to code",
    "finding the end of a rainbow",
    "counting all the grains of sand on the beach",
    "negotiating a peace treaty with the office printer",
    "swimming across the atlantic",
    "building a time machine out of paperclips",
    "mining bitcoin with an abacus"
)
$msgIndex = 0

# Hide the console cursor and clear the screen for a blank canvas
[console]::CursorVisible = $false
Clear-Host

# Set up the colors for the rapid cycle
$colors = @("White", "Cyan", "Blue", "DarkCyan", "Green", "DarkGreen")
$pulseColors = @("DarkCyan", "Cyan", "White", "Cyan", "DarkCyan", "Blue", "DarkBlue", "Blue")
$animationTypes = @("Wave", "Pulse", "Glitch", "Scanner", "Stretch")
$animIndex = 0

# Set the starting coordinates for the bouncing text
$baseX = 5
$baseY = 5

# Print an exit instruction lower down on the screen
[console]::SetCursorPosition(5, 10)
Write-Host "[ Press ENTER to end your break ]" -ForegroundColor DarkGray

$keepRunning = $true

try {
    # Loop until the Enter key switches $keepRunning to false
    while ($keepRunning) {
        
        # Pick the current animation type, message, and prepare the string
        $currentAnim = $animationTypes[$animIndex % $animationTypes.Count]
        $animatedMessage = $ridiculousMessages[$msgIndex % $ridiculousMessages.Count]
        $fullMessage = $staticMessage + $animatedMessage
        $chars = $fullMessage.ToCharArray()
        $splitIndex = $staticMessage.Length
        
        # Cycle to the next animation and message for the next loop
        $animIndex = ($animIndex + 1) % $animationTypes.Count
        $msgIndex = ($msgIndex + 1) % $ridiculousMessages.Count
        
        # Safe pad of spaces to clear the screen (dynamically sized to your window)
        $padLength = [math]::Max(10, ([console]::BufferWidth - $baseX - 1))
        $clearPad = " " * $padLength

        $frame = 0
        $typingSpeed = 3 # Frames to wait before revealing the next letter
        $holdFrames = 75 # How many frames to keep bouncing after fully typed
        $totalFrames = ($chars.Count * $typingSpeed) + $holdFrames
        
        while ($frame -lt $totalFrames) {
            
            # --- KEYBOARD CHECK ---
            # Check if a key was pressed without pausing the animation
            if ([console]::KeyAvailable) {
                $key = [console]::ReadKey($true) # $true hides the key output
                if ($key.Key -eq 'Enter') {
                    $keepRunning = $false
                    break # Exit the animation frame loop
                }
            }

            # 1. Determine how many characters should be visible (Typing effect)
            $currentLength = [math]::Min([math]::Floor($frame / $typingSpeed) + 1, $chars.Count)
            
            # 2. Erase the previous frame's letters to prevent "ghost" trails
            $clearYTop = [math]::Max(0, $baseY - 1)
            $clearYMid = [math]::Max(0, $baseY)
            $clearYBot = [math]::Min([console]::BufferHeight - 1, $baseY + 1)

            [console]::SetCursorPosition($baseX, $clearYTop)
            Write-Host $clearPad -NoNewline
            [console]::SetCursorPosition($baseX, $clearYMid)
            Write-Host $clearPad -NoNewline
            [console]::SetCursorPosition($baseX, $clearYBot)
            Write-Host $clearPad -NoNewline
            
            # 3. Draw the characters for the current frame
            for ($i = 0; $i -lt $currentLength; $i++) {
                
                if ($i -ge $splitIndex) {
                    $xPos = $baseX + $i
                    $yOffset = 0
                    $color = "White"
                    
                    switch ($currentAnim) {
                        "Wave" {
                            # Sine wave with rapid color cycle
                            $wave = [math]::Sin(($frame * 0.4) + ($i * 0.5))
                            $yOffset = [math]::Round($wave) 
                            $colorIndex = ($frame + $i) % $colors.Count
                            $color = $colors[$colorIndex]
                        }
                        "Pulse" {
                            # Straight line, breathing colors sweeping across
                            $colorIndex = [math]::Floor(($frame * 0.2) + ($i * 0.1)) % $pulseColors.Count
                            $color = $pulseColors[$colorIndex]
                        }
                        "Glitch" {
                            # Random Y offsets and flashing colors
                            if ((Get-Random -Minimum 0 -Maximum 10) -gt 7) {
                                $yOffset = (Get-Random -Minimum -1 -Maximum 2)
                            }
                            $color = $colors[(Get-Random -Minimum 0 -Maximum $colors.Count)]
                        }
                        "Scanner" {
                            # Copilot CLI style: a bright character scanning across the text
                            $animLength = $chars.Count - $splitIndex
                            $scanPos = [math]::Floor($frame / 1.5) % $animLength
                            $distance = [math]::Abs(($i - $splitIndex) - $scanPos)
                            
                            if ($distance -eq 0) {
                                $color = "White"
                            } elseif ($distance -eq 1) {
                                $color = "Cyan"
                            } else {
                                $color = "DarkCyan"
                            }
                        }
                        "Stretch" {
                            # Breathes in and out by adding spaces between characters
                            $stretchAmount = [math]::Abs([math]::Sin($frame * 0.08)) * 0.8
                            $xPos = $baseX + $i + [math]::Round(($i - $splitIndex) * $stretchAmount)
                            
                            # Slowly pulse the color while it stretches
                            $colorIndex = [math]::Floor($frame * 0.1) % $colors.Count
                            $color = $colors[$colorIndex]
                        }
                    }
                    
                    # Apply limits to ensure X and Y stay within the console buffer size
                    $safeX = [math]::Max(0, [math]::Min($xPos, [console]::BufferWidth - 1))
                    $safeY = [math]::Max(0, [math]::Min($baseY + $yOffset, [console]::BufferHeight - 1))

                    # Move the console cursor and paint the letter
                    [console]::SetCursorPosition($safeX, $safeY)
                    Write-Host $chars[$i] -NoNewline -ForegroundColor $color
                } else {
                    # Draw the static text in a straight line with a neutral color
                    $safeX = [math]::Max(0, [math]::Min($baseX + $i, [console]::BufferWidth - 1))
                    $safeY = [math]::Max(0, [math]::Min($baseY, [console]::BufferHeight - 1))

                    [console]::SetCursorPosition($safeX, $safeY)
                    Write-Host $chars[$i] -NoNewline -ForegroundColor Gray
                }
            }
            
            # Pause briefly before drawing the next animation frame
            Start-Sleep -Milliseconds 40
            $frame++
        }
        
        # If Enter was pressed during the typing phase, break out of the main loop
        if (-not $keepRunning) { break }
        
        # Disappear phase: Erase the block of text one last time
        [console]::SetCursorPosition($baseX, $clearYTop)
        Write-Host $clearPad -NoNewline
        [console]::SetCursorPosition($baseX, $clearYMid)
        Write-Host $clearPad -NoNewline
        [console]::SetCursorPosition($baseX, $clearYBot)
        Write-Host $clearPad -NoNewline
        
        # Wait a moment before starting the typing loop again.
        # We break the 1-second sleep into smaller chunks to keep checking for the 'Enter' key!
        for ($w = 0; $w -lt 25; $w++) {
            if ([console]::KeyAvailable) {
                $key = [console]::ReadKey($true)
                if ($key.Key -eq 'Enter') {
                    $keepRunning = $false
                    break
                }
            }
            Start-Sleep -Milliseconds 40
        }
    }
}
finally {
    # Clean up the screen and restore the cursor when the script ends
    [console]::CursorVisible = $true
    Clear-Host
    
    # Print a final welcome back message showing both start and end times
    $endTime = Get-Date -Format "hh:mm tt"
    Write-Host "Break started at $startTime and ended at $endTime. Welcome back!" -ForegroundColor Green
}