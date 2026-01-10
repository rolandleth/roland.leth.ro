import React from "react"
import styled from "styled-components"
import Link from "../link/Link"
import Theme from "../theme/Theme"

const projectsURL = "https://runtimesharks.com/projects"

const About = () => (
	<Container>
		<Image src="/images/misc/mypic.jpg" alt="My Picture" />
		<FirstParagraph>
			I’m an iOS developer since 2011, with extensive full-stack knowledge,
			placing myself at the crossroads of product, business, and user
			experience, balancing all three to create successful products. I've worked
			on my own projects, on remote teams, as a freelancer and contractor, or
			lead teams at big companies like{" "}
			<Link href="https://deindeal.ch" title="DeinDeal" text="DeinDeal" />
			—part of <Link href="https://ringier.ch" title="Ringier" text="Ringier" />
			—or{" "}
			<Link
				href="https://therme.media"
				title="Therme Media"
				text="Therme Media"
			/>
			—part of{" "}
			<Link
				href="https://www.thermegroup.com"
				title="Therme Group"
				text="Therme Group"
			/>
			, and started my own software company,{" "}
			<Link
				href="https://www.runtimesharks.com"
				title="Runtime Sharks"
				text="Runtime Sharks"
			/>
			, or startups like{" "}
			<Link href="https://eventa.rsvp" title="Eventa" text="Eventa" /> and{" "}
			<Link href="https://qality.tech" title="Qality Tech" text="Qality Tech" />
			.
		</FirstParagraph>
		<p>
			If you'd like to know more about my past experience, please check out{" "}
			<Link
				href="https://rolandleth.com/assets/resume.pdf"
				title="Roland Leth's resume"
				text="my résumé"
			/>
			. If I can be of help or you just want to say hi, you can drop me{" "}
			<Link
				href="mailto:roland+hi@leth.ro"
				title="Shoot me an email"
				text="an email"
			/>
			, or find me on{" "}
			<Link
				href="https://twitter.com/rolandleth"
				title="My Twitter"
				text="Twitter"
			/>
			.
		</p>
		<p />
		<p>
			You can find my privacy policy{" "}
			<Link href="/privacy-policy" text="here" title="Privacy Policy" />.
		</p>
	</Container>
)

const Container = styled.div`
	padding: 2em 0;
	border-bottom: 1px solid ${Theme.lightGray};
`

const FirstParagraph = styled.p`
	margin-top: 0;
`

const Image = styled.img`
	float: left;
	margin: 4px 1.3em 0 0;
	max-width: 200px;
`

export default About
