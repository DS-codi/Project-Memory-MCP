# 1) Live CPU (10-second sample, normalized by core count)
````
$cores = (Get-CimInstance Win32_ComputerSystem).NumberOfLogicalProcessors
Get-Counter '\Process(*)\% Processor Time' -SampleInterval 1 -MaxSamples 10 |
  Select-Object -ExpandProperty CounterSamples |
  Where-Object { $_.InstanceName -notmatch '^(_total|idle)$' } |
  Group-Object InstanceName |
  ForEach-Object {
    [pscustomobject]@{
      Process = $_.Name
      AvgCPUPercent = [math]::Round((($_.Group.CookedValue | Measure-Object -Average).Average / $cores),1)
      PeakCPUPercent = [math]::Round((($_.Group.CookedValue | Measure-Object -Maximum).Maximum / $cores),1)
    }
  } | Sort-Object AvgCPUPercent -Descending | Select-Object -First 15
  

  PS C:\Users\codi.f\local_workspace> # 1) Live CPU (10-second sample, normalized by core count)
>> $cores = (Get-CimInstance Win32_ComputerSystem).NumberOfLogicalProcessors
>> Get-Counter '\Process(*)\% Processor Time' -SampleInterval 1 -MaxSamples 10 |
>>   Select-Object -ExpandProperty CounterSamples |
>>   Where-Object { $_.InstanceName -notmatch '^(_total|idle)$' } |
>>   Group-Object InstanceName |
>>   ForEach-Object {
>>     [pscustomobject]@{
>>       Process = $_.Name
>>       AvgCPUPercent = [math]::Round((($_.Group.CookedValue | Measure-Object -Average).Average / $cores),1)
>>       PeakCPUPercent = [math]::Round((($_.Group.CookedValue | Measure-Object -Maximum).Maximum / $cores),1)
>>     }
>>   } | Sort-Object AvgCPUPercent -Descending | Select-Object -First 15

Process                     AvgCPUPercent PeakCPUPercent
-------                     ------------- --------------
srfeature                            1.50           2.10
taskmgr                              1.40           2.00
system                               1.10           1.40
pcxflt                               1.10           1.90
dwm                                  1.10           1.40
srfeatmini                           1.00           1.80
vmmemwsl                             0.90           4.00
autohotkey64                         0.80           1.30
code                                 0.70          19.10
foxitpdfreaderupdateservice          0.40           0.80
secam10                              0.30           0.80
gimp-3                               0.30           0.50
stoneprocad                          0.30           0.90
ekrn                                 0.30           0.80
srmanager                            0.20           0.60
````

# 2) Memory pressure (if this is high, "grinding halt" = paging/commit pressure)

````
Get-Counter '\Memory\Available MBytes','\Memory\% Committed Bytes In Use','\Memory\Pages/sec' -SampleInterval 1 -MaxSamples 10

PS C:\Users\codi.f\local_workspace> Get-Counter '\Memory\Available MBytes','\Memory\% Committed Bytes In Use','\Memory\Pages/sec' -SampleInterval 1 -MaxSamples 10

Timestamp                 CounterSamples
---------                 --------------
6/03/2026 8:28:51 PM      \\ds-ws06\memory\available mbytes :
                          12415

                          \\ds-ws06\memory\% committed bytes in use :
                          74.53309310938536

                          \\ds-ws06\memory\pages/sec :
                          0


6/03/2026 8:28:52 PM      \\ds-ws06\memory\available mbytes :
                          12407

                          \\ds-ws06\memory\% committed bytes in use :
                          74.5470050197437

                          \\ds-ws06\memory\pages/sec :
                          0


6/03/2026 8:28:53 PM      \\ds-ws06\memory\available mbytes :
                          12390

                          \\ds-ws06\memory\% committed bytes in use :
                          74.58850079555728

                          \\ds-ws06\memory\pages/sec :
                          0


6/03/2026 8:28:54 PM      \\ds-ws06\memory\available mbytes :
                          12392

                          \\ds-ws06\memory\% committed bytes in use :
                          74.57472087689086

                          \\ds-ws06\memory\pages/sec :
                          40.93989205049147


6/03/2026 8:28:55 PM      \\ds-ws06\memory\available mbytes :
                          12408

                          \\ds-ws06\memory\% committed bytes in use :
                          74.54293164763203

                          \\ds-ws06\memory\pages/sec :
                          0.9987414858536757


6/03/2026 8:28:56 PM      \\ds-ws06\memory\available mbytes :
                          12409

                          \\ds-ws06\memory\% committed bytes in use :
                          74.54639311752896

                          \\ds-ws06\memory\pages/sec :
                          0.9988065260819846


6/03/2026 8:28:57 PM      \\ds-ws06\memory\available mbytes :
                          12412

                          \\ds-ws06\memory\% committed bytes in use :
                          74.54053800891631

                          \\ds-ws06\memory\pages/sec :
                          0


6/03/2026 8:28:58 PM      \\ds-ws06\memory\available mbytes :
                          12414

                          \\ds-ws06\memory\% committed bytes in use :
                          74.55043652433679

                          \\ds-ws06\memory\pages/sec :
                          0.9989249569613182


6/03/2026 8:28:59 PM      \\ds-ws06\memory\available mbytes :
                          12395

                          \\ds-ws06\memory\% committed bytes in use :
                          74.5768445484752

                          \\ds-ws06\memory\pages/sec :
                          0.999265639681398


6/03/2026 8:29:00 PM      \\ds-ws06\memory\available mbytes :
                          12393

                          \\ds-ws06\memory\% committed bytes in use :
                          74.57468488127334

                          \\ds-ws06\memory\pages/sec :
                          6.883221331850228

````


# 3) VS Code process roles (find extensionHost, renderer, etc.)
````
Get-CimInstance Win32_Process -Filter "Name='Code.exe'" |
  Select-Object ProcessId,ParentProcessId,@{N='WS_MB';E={[math]::Round($_.WorkingSetSize/1MB,1)}},CommandLine

ProcessId ParentProcessId  WS_MB CommandLine
--------- ---------------  ----- -----------
    34512           11608 209.30 "C:\Users\codi.f\AppData\Local\Programs\Microsoft VS Code\Code.exe" --file-uri "file:///s%3A/NotionArchive/NotionArchive.code-workspa… 
    36472           34512   3.20 "C:\Users\codi.f\AppData\Local\Programs\Microsoft VS Code\Code.exe" --type=crashpad-handler --user-data-dir=C:\Users\codi.f\AppData\R… 
    25872           34512 142.70 "C:\Users\codi.f\AppData\Local\Programs\Microsoft VS Code\Code.exe" --type=gpu-process --user-data-dir="C:\Users\codi.f\AppData\Roami… 
    28108           34512  17.40 "C:\Users\codi.f\AppData\Local\Programs\Microsoft VS Code\Code.exe" --type=utility --utility-sub-type=network.mojom.NetworkService --… 
    21140           34512 131.30 "C:\Users\codi.f\AppData\Local\Programs\Microsoft VS Code\Code.exe" --type=utility --utility-sub-type=node.mojom.NodeService --lang=e… 
    34564           34512  70.60 "C:\Users\codi.f\AppData\Local\Programs\Microsoft VS Code\Code.exe" --type=utility --utility-sub-type=node.mojom.NodeService --lang=e… 
    35744           34512 885.60 "C:\Users\codi.f\AppData\Local\Programs\Microsoft VS Code\Code.exe" --type=renderer --user-data-dir="C:\Users\codi.f\AppData\Roaming\… 
    47696           34512 490.50 "C:\Users\codi.f\AppData\Local\Programs\Microsoft VS Code\Code.exe" --type=utility --utility-sub-type=node.mojom.NodeService --lang=e… 
    38260           34512  36.70 "C:\Users\codi.f\AppData\Local\Programs\Microsoft VS Code\Code.exe" --type=utility --utility-sub-type=node.mojom.NodeService --lang=e… 
    26364           47696   9.20 "C:\Users\codi.f\AppData\Local\Programs\Microsoft VS Code\Code.exe" --max-old-space-size=3072 "c:\Users\codi.f\AppData\Local\Programs… 
    37672           47696   4.70 "C:\Users\codi.f\AppData\Local\Programs\Microsoft VS Code\Code.exe" --max-old-space-size=3072 "c:\Users\codi.f\AppData\Local\Programs… 
    46084           37672  12.20 "C:\Users\codi.f\AppData\Local\Programs\Microsoft VS Code\Code.exe" "c:/Users/codi.f/AppData/Local/Programs/Microsoft VS Code/0870c2a… 
     4724           47696 112.00 "C:\Users\codi.f\AppData\Local\Programs\Microsoft VS Code\Code.exe" "c:\Users\codi.f\AppData\Local\Programs\Microsoft VS Code\0870c2a… 
    34820           34512 841.30 "C:\Users\codi.f\AppData\Local\Programs\Microsoft VS Code\Code.exe" --type=renderer --user-data-dir="C:\Users\codi.f\AppData\Roaming\… 
    45188           47696 116.10 "C:\Users\codi.f\AppData\Local\Programs\Microsoft VS Code\Code.exe" "c:\Users\codi.f\AppData\Local\Programs\Microsoft VS Code\0870c2a… 
    19736           34512 111.60 "C:\Users\codi.f\AppData\Local\Programs\Microsoft VS Code\Code.exe" --type=renderer --user-data-dir="C:\Users\codi.f\AppData\Roaming\… 
     9092           34512 990.20 "C:\Users\codi.f\AppData\Local\Programs\Microsoft VS Code\Code.exe" --type=utility --utility-sub-type=node.mojom.NodeService --lang=e… 
    30096           34512 142.00 "C:\Users\codi.f\AppData\Local\Programs\Microsoft VS Code\Code.exe" --type=utility --utility-sub-type=node.mojom.NodeService --lang=e… 
    22896           34512 126.90 "C:\Users\codi.f\AppData\Local\Programs\Microsoft VS Code\Code.exe" --type=renderer --user-data-dir="C:\Users\codi.f\AppData\Roaming\… 
    23192            9092 119.60 "C:\Users\codi.f\AppData\Local\Programs\Microsoft VS Code\Code.exe" "c:\Users\codi.f\AppData\Local\Programs\Microsoft VS Code\0870c2a… 
    20864            9092 122.10 "C:\Users\codi.f\AppData\Local\Programs\Microsoft VS Code\Code.exe" "c:\Users\codi.f\AppData\Local\Programs\Microsoft VS Code\0870c2a… 
````
