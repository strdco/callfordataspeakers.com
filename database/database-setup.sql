IF (SCHEMA_ID('CallForDataSpeakers') IS NULL)
    EXEC('CREATE SCHEMA CallForDataSpeakers;');


GO
GRANT EXECUTE ON SCHEMA::CallForDataSpeakers TO CallForDataSpeakers;


GO
IF (OBJECT_ID('CallForDataSpeakers.Campaigns') IS NULL)
    CREATE TABLE CallForDataSpeakers.Campaigns (
        Token           uniqueidentifier NOT NULL,
        [Name]          nvarchar(200) NOT NULL,
        Email           nvarchar(400) NOT NULL,
        Regions         nvarchar(200) NOT NULL,
        Venue           nvarchar(1000) NOT NULL,
        [Date]          date NOT NULL,
        [URL]           nvarchar(1000) NOT NULL,
        Created         datetime2(3) NOT NULL,
        Approved        datetime2(3) NULL,
        [Sent]          datetime2(3) NULL,
        CONSTRAINT PK_Campaigns PRIMARY KEY CLUSTERED (Token)
    );



GO
CREATE OR ALTER PROCEDURE CallForDataSpeakers.Insert_Campaign
    @Name           nvarchar(200),
    @Email          nvarchar(400),
    @Regions        nvarchar(200),
    @Venue          nvarchar(1000),
    @Date           date,
    @URL            nvarchar(1000)
AS

INSERT INTO CallForDataSpeakers.Campaigns (Token, [Name], Email, Regions, Venue, [Date], [URL], Created)
OUTPUT inserted.Token
SELECT NEWID() AS Token, @Name, @Email, @Regions, @Venue, @Date, @URL, SYSDATETIME() AS Created;

GO
