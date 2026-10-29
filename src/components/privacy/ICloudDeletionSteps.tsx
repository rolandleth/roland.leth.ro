interface ICloudDeletionStepsProps {
	/** The app's name as the page writes it, such as "Weekly Gym". */
	appName: string
	/** What the reader deletes, such as "your journal". Defaults to "your data". */
	dataName?: string
}

/**
 * The "Deleting your data" text for an app that syncs through the reader's own
 * iCloud and has no in-app delete-all. The Digest, Reckon and Weekly Gym privacy
 * pages share it, so the Settings path and the order of the steps live here
 * once: the app goes first, so no device is left to sync its copy back. The
 * order is ours; the Settings path is Apple's, linked to its own article
 * (support.apple.com/108922), which names both "Storage" and "Manage Account
 * Storage".
 */
export default function ICloudDeletionSteps({
	appName,
	dataName = "your data",
}: ICloudDeletionStepsProps) {
	return (
		<>
			<p>
				{appName} has no button that deletes everything. To delete {dataName},
				delete {appName} from every device that has it, then delete its data
				from iCloud, as{" "}
				<a
					href="https://support.apple.com/en-us/108922"
					target="_blank"
					rel="noopener noreferrer"
				>
					Apple describes it
				</a>
				: in Settings, tap your name, then iCloud, then Storage or Manage
				Account Storage, choose {appName} and tap Delete Data from iCloud. Do it
				in that order, so no device is left that could sync its copy back.
			</p>
			<p>
				If {appName} has never synced, because you&apos;ve never been signed in
				to iCloud or iCloud has always been off for {appName}, deleting the app
				is enough. Signing out of iCloud, or turning iCloud off for {appName},
				leaves what already synced in your iCloud account until you delete it
				there, with the steps above.
			</p>
		</>
	)
}
