import {useQuery, useQueryClient} from '@tanstack/react-query'
import {NoteImage} from '@yshvydak/core'
import {noteImageService} from '@/services/noteImage.service'

export interface UseNoteImagesReturn {
    images: NoteImage[]
    loading: boolean
    error: string | null
    refetch: () => Promise<void>
}

export function useNoteImages(testId: string | null, enabled: boolean = true): UseNoteImagesReturn {
    const queryClient = useQueryClient()

    const {
        data: images = [],
        isLoading,
        error,
        refetch: queryRefetch,
    } = useQuery<NoteImage[]>({
        queryKey: ['noteImages', testId],
        queryFn: async () => {
            if (!testId) return []
            return noteImageService.getImages(testId)
        },
        enabled: enabled && !!testId,
        staleTime: 30000, // 30 seconds
    })

    const refetchImages = async () => {
        if (testId) {
            await queryClient.invalidateQueries({queryKey: ['noteImages', testId]})
        } else {
            await queryRefetch()
        }
    }

    return {
        images,
        loading: isLoading,
        error: error ? (error instanceof Error ? error.message : 'Failed to fetch images') : null,
        refetch: refetchImages,
    }
}
