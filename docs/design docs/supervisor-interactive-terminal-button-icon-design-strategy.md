# Supervisor + Interactive Terminal Icon Design Specification

## Scope
This document defines the required icon set for the Supervisor GUI and Interactive Terminal GUI.
The output is implementation-focused: icon inventory, control mapping, geometry, and state behavior.

## Global Style System
| Property | Spec |
|---|---|
| Master size | 24x24 px |
| Active drawing area | 20x20 px (2 px inset) |
| Primary stroke | 1.75 px |
| Secondary stroke | 1.5 px |
| Line caps and joins | Round |
| Corner radii | 2 px small, 3 px medium, 4 px chip/container |
| Min negative space | 1.5 px |
| Max complexity | 3 major primitives + 2 minor details |
| Baseline color | #D4D4D4 |
| Hover color | #FFFFFF |
| Disabled opacity | 38% |

## State Rules
| State | Visual Rule |
|---|---|
| Default | Stroke only, no fill |
| Hover | Brighter stroke; optional chip #FFFFFF14 |
| Pressed/Active | Accent stroke or semantic fill; optional chip #FFFFFF22 |
| Disabled | 38% opacity; no semantic fill |
| Toggle ON | Add active dot or check indicator |
| Danger actions | Red accent only on hover/active |

## Required Icon Inventory (33 Tokens)
| Token | Purpose |
|---|---|
| icon.window_show | Bring app window to foreground |
| icon.window_hide_tray | Minimize/hide window to tray |
| icon.autostart | Toggle Start with Windows |
| icon.quit | Exit application |
| icon.restart | Restart service/session |
| icon.refresh | Reload list/data |
| icon.open_external | Open URL/file in external target |
| icon.open_collection | Open a collection/workspace-scoped set |
| icon.start | Start service/process |
| icon.stop | Stop service/session |
| icon.scan | Trigger project/cartography scan |
| icon.settings | Open settings/config |
| icon.save | Save changes |
| icon.cancel | Cancel current operation |
| icon.launch_cli | Launch CLI session |
| icon.saved_commands | Open saved command manager |
| icon.allowlist | Open allowlist manager |
| icon.to_allowlist | Convert command to allowlist proposal |
| icon.new_tab | Create a new tab/session |
| icon.rename | Rename active item |
| icon.copy_all | Copy full content |
| icon.copy_last | Copy latest command result |
| icon.export_txt | Export as text |
| icon.export_json | Export as JSON |
| icon.clear | Clear output/content |
| icon.approve | Approve request |
| icon.confirm | Confirm proposal/action |
| icon.deny | Reject request |
| icon.delete | Delete stored item |
| icon.run | Execute command |
| icon.add | Add item |
| icon.remove | Remove item from list/policy |
| icon.close | Close tab/panel |

## Supervisor GUI Control Mapping
| Control | Action | Token |
|---|---|---|
| Show Supervisor | Show window | icon.window_show |
| MCP Server - Restart | Restart MCP | icon.restart |
| Interactive Terminal - Restart | Restart terminal service | icon.restart |
| Dashboard - Restart | Restart dashboard | icon.restart |
| Fallback API - Restart | Restart fallback API | icon.restart |
| Quit Supervisor | Quit app | icon.quit |
| Service card: Restart | Restart selected service | icon.restart |
| Interactive Terminal card: Open | Open terminal URL | icon.open_external |
| Interactive Terminal card: Start/Stop | Start or stop terminal service | icon.start / icon.stop |
| Dashboard card: Visit | Open dashboard URL | icon.open_external |
| Active Sessions: Stop | Stop live session | icon.stop |
| Workspace list: Refresh | Reload workspace list | icon.refresh |
| Scan Project | Run cartographer scan | icon.scan |
| Configuration | Open config editor | icon.settings |
| Minimize to Tray | Hide window to tray | icon.window_hide_tray |
| Open in Editor | Open config in editor | icon.open_external |
| Config editor: Save | Save config | icon.save |
| Config editor: Cancel | Cancel edit | icon.cancel |

## Interactive Terminal GUI Control Mapping
| Control | Action | Token |
|---|---|---|
| Tray: Show | Show window | icon.window_show |
| Tray: Start with Windows | Toggle autostart | icon.autostart |
| Tray: Quit | Quit app | icon.quit |
| Launch Gemini CLI | Launch Gemini session | icon.launch_cli |
| Launch Copilot CLI | Launch Copilot session | icon.launch_cli |
| Gemini settings button | Open settings dialog | icon.settings |
| Saved Commands | Open saved commands drawer | icon.saved_commands |
| Allowlist | Open allowlist drawer | icon.allowlist |
| New Tab | New session tab | icon.new_tab |
| Rename | Rename session | icon.rename |
| Restart | Reattach/restart active session | icon.restart |
| Copy All | Copy output | icon.copy_all |
| Copy Last | Copy latest output | icon.copy_last |
| Tab close X | Close session tab | icon.close |
| Output: Copy | Copy output text | icon.copy_all |
| Output: Save TXT | Export text | icon.export_txt |
| Output: Save JSON | Export JSON | icon.export_json |
| Output: Clear | Clear output view | icon.clear |
| Approval: Approve | Approve pending command | icon.approve |
| Approval: Deny/Decline | Reject pending command | icon.deny |
| Gemini dialog: Save | Save API key | icon.save |
| Gemini dialog: Remove | Remove API key | icon.delete |
| Saved Commands: Open | Load workspace command set | icon.open_collection |
| Saved Commands: Save | Save command entry | icon.save |
| Saved Commands: Delete Selected | Delete selected command | icon.delete |
| Saved Commands: -> Allowlist | Propose allowlist pattern | icon.to_allowlist |
| Saved Commands: Confirm | Confirm pattern proposal | icon.confirm |
| Saved Commands: Cancel | Cancel pattern proposal | icon.cancel |
| Saved Commands: Run In Selected Session | Execute saved command | icon.run |
| Allowlist: Refresh | Reload allowlist | icon.refresh |
| Allowlist: Add | Add pattern | icon.add |
| Allowlist pattern remove X | Remove pattern | icon.remove |
| Allowlist: Close | Close drawer | icon.close |

## Icon Design Definitions
| Token | Visual Metaphor | Geometry (24x24) | State Notes |
|---|---|---|---|
| icon.window_show | Window + outbound focus arrow | 16x12 rounded frame; 7 px NE arrow exiting frame | Hover brightens arrow; active fills arrowhead |
| icon.window_hide_tray | Window collapsing to tray | 16x10 frame above 14x2 tray line; down chevron between | Hover highlights tray; active compresses chevron |
| icon.autostart | Power symbol + window badge | 10 px power ring/stem + 9x7 badge at lower-right | Toggle-on adds confirmation dot |
| icon.quit | Power off symbol | 12 px ring with top gap + center stem | Danger tint on hover/active |
| icon.restart | Circular arrow | 14 px arc with 4.5 px arrowhead at 1 o'clock | Optional short rotate motion on hover |
| icon.refresh | Dual loop arrows | Two opposing 120-degree arcs around 13 px circle | Active may run short sweep animation |
| icon.open_external | Box + outgoing arrow | 12x10 open-top box; 7 px arrow exiting top-right | Arrowhead fills on active |
| icon.open_collection | Open folder | 6x3 tab + 15x9 body with angled top edge | Low-alpha fill on active |
| icon.start | Play | 12x12 right-pointing triangle | Success tint on hover/active |
| icon.stop | Stop | 10x10 rounded square (2 px radius) | Danger tint on hover/active |
| icon.scan | Magnifier over nodes | 10 px lens + 2x2 node grid with 1.5 px links | Hover emphasizes lens ring |
| icon.settings | Gear | 10 px center circle + 6 teeth | Active may fill center dot |
| icon.save | Save tile/floppy | 14x14 rounded square with top notch + 6x4 label bar | Label bar fills on active |
| icon.cancel | Circle + X | 12 px circle + 8 px centered X | Neutral cancel by default; danger only in destructive contexts |
| icon.launch_cli | Terminal + launch marker | 14x10 terminal frame + prompt glyph + 4 px marker | Marker brightens on hover |
| icon.saved_commands | Stacked command list | 14x12 document with 3 horizontal lines + bookmark notch | Bookmark fills on active |
| icon.allowlist | Shield + check | 12 px shield contour + 5 px check | Success tint on hover/active |
| icon.to_allowlist | Arrow into shield | 7 px right arrow entering 10 px shield | Active fills shield lightly |
| icon.new_tab | Tab + plus | 14x10 tab frame + 6 px plus | Plus highlighted on hover |
| icon.rename | Pencil + baseline | 9 px pencil at 35 degrees above 10 px baseline | Pencil tip emphasized on active |
| icon.copy_all | Two documents | Overlapping sheets with 2 px offset | Front sheet corner fills on active |
| icon.copy_last | Copy + time badge | icon.copy_all base + 6 px clock badge | Clock center fills on active |
| icon.export_txt | Document + down arrow | 12x14 page with fold + 6 px down arrow | Arrowhead fills on active |
| icon.export_json | Braces + down arrow | Left/right braces flanking 6 px down arrow | Brace contrast increases on hover |
| icon.clear | Eraser + baseline | 10x6 tilted eraser over 12 px line | Warning tint on hover/active |
| icon.approve | Check in circle | 12 px circle + 7 px check | Success fill + inverse check on active |
| icon.confirm | Check + badge | icon.approve base + 3 px badge dot | Badge emphasized on active |
| icon.deny | Circle slash | 12 px circle + 8 px diagonal slash | Danger tint on hover/active |
| icon.delete | Trash can | 10x11 can body + lid + 2 vertical inner lines | Danger fill on active |
| icon.run | Terminal + play | 12x9 terminal frame + 6 px play triangle | Triangle accent on hover/active |
| icon.add | Plus in circle | 12 px circle + 7 px plus | Accent stroke; low-alpha fill active |
| icon.remove | Minus in circle | 12 px circle + 7 px minus | Danger tint on hover/active |
| icon.close | Close X control | 8 px X in optional 12 px rounded hit chip | Chip appears on hover, darkens on active |

## Implementation Rules
| Rule | Requirement |
|---|---|
| Token consistency | Use token IDs exactly as defined above in all QML views |
| Dynamic controls | For Start/Stop, swap token by state; do not rely on color-only changes |
| Hit target | Minimum clickable target 28x28 px, independent of glyph size |
| Destructive X handling | Use icon.remove for data mutation; reserve icon.close for view/tab dismissal |
| Scaling | Export source vectors at 24 px and render at 20 px and 16 px using optical snapping |

## QA Checklist
| Check | Pass Criteria |
|---|---|
| Coverage | Every in-scope control has a mapped icon token |
| Consistency | Stroke, radius, and spacing match global style system |
| Clarity | Stop/Delete/Deny remain visually distinct from Close/Cancel |
| States | Default, hover, active, disabled, and toggle states all render correctly |
| Crispness | Icons are sharp at 24, 20, and 16 px on dark UI backgrounds |
