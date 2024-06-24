import { ElectronBasePlugin, ElectronBasePluginClient } from "@remixproject/plugin-electron"

import { Profile } from "@remixproject/plugin-utils";

const profile: Profile = {
  displayName: 'circom',
  name: 'circom',
  description: 'Circom language compiler'
}

export class CircomElectronPlugin extends ElectronBasePlugin {
  clients: CircomElectronPluginClient[] = []

  constructor() {
    super(profile, clientProfile, CircomElectronPluginClient)
    this.methods = [...super.methods]
  }
}

const clientProfile: Profile = {
  name: 'circom',
  displayName: 'circom',
  description: 'Circom Language Compiler',
  methods: ['parse', 'compile', 'generateR1cs']
}

class CircomElectronPluginClient extends ElectronBasePluginClient {
  circomIsInstalled: boolean = false

  constructor(webContentsId: number, profile: Profile) {
    super(webContentsId, profile)
    this.onload()
  }

  compile(): void {
    console.log('compiling circom circuit...')
  }

  parse(): void {
    console.log('parsing circom electron plugin...')
  }

  generateR1cs(): void {
    console.log('generating r1cs circom electron plugin...')
  }
}