import React from "react"
import styled from "styled-components"
import Footer from "../Footer"
import Link from "../link/Link"

const Intro = () => (
	<Grid>
		<Container>
			<Greeting>Hi, I'm Roland Leth</Greeting>
			<p>
				I’m an iOS developer since 2011, with extensive full-stack knowledge,
				placing myself at the crossroads of product, business, and user
				experience, balancing all three to create successful products. I'm also
				an entrepreneur, amateur designer and occasional blogger. There used to
				be a blog here and everything is still there and directly accesisble,
				it's just that I don't really write anymore.
			</p>
			<p>
				If I can be of help or you just want to say hi, you can drop me at{" "}
				<Link
					href="mailto:roland+hi@leth.ro"
					title="Shoot me an email"
					text="an email"
				/>
				, or find me on{" "}
				<Link
					href="https://twitter.com/rolandleth"
					title="Roland Leth's Twitter"
					text="Twitter"
				/>
				. You can find out more about me on{" "}
				<Link href="/about" title="About Roland Leth" text="my about page" /> or
				about my projects on{" "}
				<Link
					href="https://runtimesharks.com"
					title="Runtime Sharks"
					text="my company's page"
				/>
				.
			</p>
		</Container>
		<Footer />
	</Grid>
)

const Grid = styled.div`
	display: grid;
	align-content: center;
	min-height: 80vh;
`

const Container = styled.div`
	margin-top: 1em;
	margin-bottom: 1em;
`

const Greeting = styled.h1`
	text-align: center;
	display: block;
`

export default Intro
