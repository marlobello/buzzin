<script lang="ts">
	import { onMount } from 'svelte';
	import '../app.css';
	import type { Snippet } from 'svelte';

	let { children }: { children: Snippet } = $props();

	onMount(async () => {
		const clarity = await import('@microsoft/clarity');
		clarity.default.init('w7l6yejqsq');
	});
</script>

{@render children()}
