import assert from 'node:assert/strict'
import { parseConnectedWifi } from '../electron/wifi.ts'

// Sample `netsh wlan show interfaces` output in several display languages. The labels change; the SSID (the line above
// BSSID) and the signal (the only "NN%" value) keep their shape.
const samples = [
  {
    language: 'English',
    output: `
There is 1 interface on the system:

    Name                   : Wi-Fi
    Description            : Intel(R) Wi-Fi 6 AX201 160MHz
    GUID                   : 7c7a3d6e-2b1c-4f4c-9a3e-9f0d2b5c1a11
    Physical address       : 3c:58:c2:1a:2b:3c
    State                  : connected
    SSID                   : HomeNetwork
    BSSID                  : 9a:8b:7c:6d:5e:4f
    Network type           : Infrastructure
    Radio type             : 802.11ac
    Authentication         : WPA2-Personal
    Cipher                 : CCMP
    Connection mode        : Auto Connect
    Channel                : 36
    Receive rate (Mbps)    : 866
    Transmit rate (Mbps)   : 866
    Signal                 : 87%
    Profile                : HomeNetwork
`,
    ssid: 'HomeNetwork',
    signal: 87
  },
  {
    language: 'German',
    output: `
Es ist 1 Schnittstelle auf dem System vorhanden:

    Name                   : WLAN
    Beschreibung           : Intel(R) Wi-Fi 6 AX201 160MHz
    GUID                   : 7c7a3d6e-2b1c-4f4c-9a3e-9f0d2b5c1a11
    Physische Adresse      : 3c:58:c2:1a:2b:3c
    Status                 : Verbunden
    SSID                   : Heimnetz
    BSSID                  : 9a:8b:7c:6d:5e:4f
    Netzwerktyp            : Infrastruktur
    Funktyp                : 802.11ac
    Authentifizierung      : WPA2-Personal
    Verschlüsselung        : CCMP
    Verbindungsmodus       : Automatisch verbinden
    Kanal                  : 36
    Empfangsrate (MBit/s)  : 866
    Übertragungsrate (MBit/s) : 866
    Signal                 : 62%
    Profil                 : Heimnetz
`,
    ssid: 'Heimnetz',
    signal: 62
  },
  {
    language: 'French',
    output: `
Il y a 1 interface sur le système :

    Nom                    : Wi-Fi
    Description            : Intel(R) Wi-Fi 6 AX201 160MHz
    GUID                   : 7c7a3d6e-2b1c-4f4c-9a3e-9f0d2b5c1a11
    Adresse physique       : 3c:58:c2:1a:2b:3c
    État                   : Connecté
    SSID                   : Maison
    BSSID                  : 9a:8b:7c:6d:5e:4f
    Type de réseau         : Infrastructure
    Type de radio          : 802.11ac
    Authentification       : WPA2-Personal
    Chiffrement            : CCMP
    Mode de connexion      : Connexion automatique
    Canal                  : 36
    Vitesse de réception (Mbits/s) : 866
    Vitesse de transmission (Mbits/s) : 866
    Signal                 : 71%
    Profil                 : Maison
`,
    ssid: 'Maison',
    signal: 71
  },
  {
    language: 'Chinese (Simplified)',
    output: `
系统上有 1 个接口:

    名称                   : WLAN
    描述                   : Intel(R) Wi-Fi 6 AX201 160MHz
    GUID                   : 7c7a3d6e-2b1c-4f4c-9a3e-9f0d2b5c1a11
    物理地址               : 3c:58:c2:1a:2b:3c
    状态                   : 已连接
    SSID                   : 家里网络
    BSSID                  : 9a:8b:7c:6d:5e:4f
    网络类型               : 结构
    无线电类型             : 802.11ac
    身份验证               : WPA2-个人
    密码                   : CCMP
    连接模式               : 自动连接
    信道                   : 36
    接收速率(Mbps)         : 866
    传输速率(Mbps)         : 866
    信号                   : 55%
    配置文件               : 家里网络
`,
    ssid: '家里网络',
    signal: 55
  },
  {
    language: 'disconnected',
    output: `
There is 1 interface on the system:

    Name                   : Wi-Fi
    Description            : Intel(R) Wi-Fi 6 AX201 160MHz
    GUID                   : 7c7a3d6e-2b1c-4f4c-9a3e-9f0d2b5c1a11
    Physical address       : 3c:58:c2:1a:2b:3c
    State                  : disconnected
`,
    ssid: null,
    signal: null
  },
  {
    language: 'empty',
    output: '',
    ssid: null,
    signal: null
  }
]

let failed = 0
for (const sample of samples) {
  try {
    assert.deepEqual(parseConnectedWifi(sample.output), { ssid: sample.ssid, signal: sample.signal })
    console.log(`ok   ${sample.language}`)
  } catch (err) {
    failed++
    console.error(`FAIL ${sample.language}: ${err.message}`)
  }
}
if (failed) {
  console.error(`${failed} sample(s) failed`)
  process.exit(1)
}
console.log(`${samples.length} samples passed`)
