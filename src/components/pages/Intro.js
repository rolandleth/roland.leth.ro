import React from "react"
import styled from "styled-components"
import ColorOnHoverLink from "../link/ColorOnHoverLink"
import Link from "../link/Link"
import Theme from "../theme/Theme"

const Intro = () => (
	<Container>
		<Greeting>Hello, I'm Roland Leth.</Greeting>
		<p>
			I’m an iOS developer since 2011, with extensive full-stack knowledge,
			placing myself at the crossroads of product, business, and user
			experience, balancing all three to create successful products. I'm also an
			entrepreneur, amateur designer and occasional blogger. Lately, I've been
			fascinated more and more about the human brain, our behaviour and how we
			can improve ourselves. Naturally, the two sections of this blog are about:
		</p>
		<List>
			<ListItem className="tech">
				<ColorOnHoverLink href="/tech/blog" title="Tech blog">
					<img
						className="illustration"
						src="/images/developer.svg"
						alt="A developer in front of 6 monitors"
					/>
				</ColorOnHoverLink>
				<p>
					Snippets, walkthroughs, tips and tricks, stuff that I struggled with,
					links to interesting stuff I find around the web and helpful tools.
					I'm mostly writing about iOS, but also about JS/TS, occasionally.
				</p>
			</ListItem>
			<ListItem className="life">
				<p>
					My journey of self-improvement and the lessons I've learned — on my
					own, or from what I read. The posts will be about habits, identity
					change, motivation, productivity and self-improvement.
				</p>
				<ColorOnHoverLink href="/life/blog" title="Life blog">
					<img
						className="illustration"
						src="/images/progress.svg"
						alt="Woman moving gears"
					/>
				</ColorOnHoverLink>
			</ListItem>
		</List>
		<p>
			If I can be of help or you just want to say hi, you can drop me an email
			at{" "}
			<Link
				href="mailto:roland+hi@leth.ro"
				title="Shoot me an email"
				text="hi@rolandleth.com"
			/>
			, or find me on Twitter{" "}
			<Link
				href="https://twitter.com/rolandleth"
				title="Roland Leth's Twitter"
				text="@rolandleth"
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
)

const Container = styled.div`
	img.illustration {
		box-shadow: none;
		max-width: 300px;
	}

	@media screen and (max-width: ${Theme.navTreshold1}) {
		img.illustration {
			max-width: 200px;
		}
	}

	@media screen and (max-width: 600px) {
		.life {
			& > img.illustration {
				max-width: 300px;
				grid-row: 1;
			}

			& > p {
				margin-bottom: 0;
			}
		}
	}
`

const Greeting = styled.h1``

const List = styled.div`
	padding: 60px 0 40px;
	display: grid;
	grid-gap: 80px;

	@media screen and (max-width: ${Theme.navTreshold1}) {
		padding: 20px 0 0;
		grid-gap: 40px;
	}

	@media screen and (max-width: 600px) {
		grid-gap: 20px;
	}
`

const ListItem = styled.div`
	display: grid;
	justify-items: center;
	align-items: center;
	grid-template-columns: auto auto;
	grid-gap: 60px;

	@media screen and (max-width: ${Theme.navTreshold1}) {
		grid-gap: 40px;
	}

	@media screen and (max-width: 600px) {
		grid-template-columns: auto;
		grid-gap: 0;
	}
`

export default Intro
