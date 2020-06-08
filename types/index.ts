export type WebsocketOpt = {
    remixIdeUrl: string
}

export type SharedFolderArgs = {
    path: string,
    [key: string]: string | number | boolean
}

export type KeyPairString = {
    [key: string]: string
}

export type ResolveDirectory = {
    [key: string]: {
        isDirectory: boolean
    }
}

export type WebsocketProfile = {
    name: string
    methods?: string[]
    permission?: boolean
    hash?: string
    redirect?: {
      [key: string]: string
    }
}

export type TrackDownStreamUpdate = KeyPairString